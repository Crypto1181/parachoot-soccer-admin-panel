import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Plus, Pencil, Trash2, Video, Calendar, Search, Clock, RefreshCw } from 'lucide-react';
import { syncMatchesFromFlashscore } from '@/lib/flashscore';
import { flashscoreApi } from '@/lib/flashscoreApi';
import { cn } from '@/lib/utils';

interface Team {
  id: string;
  name: string;
  logo_url: string;
}

interface Match {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  status: 'live' | 'upcoming' | 'finished';
  competition: string;
  start_time: string;
  stream_url?: string;
  venue?: string;
  home_team?: Team;
  away_team?: Team;
  is_api_match?: boolean;
}

export default function MatchManager() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));

  // Form State
  const [formData, setFormData] = useState<Partial<Match>>({
    home_team_id: '',
    away_team_id: '',
    home_score: 0,
    away_score: 0,
    status: 'upcoming',
    competition: '',
    start_time: '',
    stream_url: '',
  });

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch DB Matches
      const [matchesRes, teamsRes] = await Promise.all([
        supabase
          .from('matches')
          .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*)')
          .order('start_time', { ascending: false }),
        supabase.from('teams').select('*').order('name')
      ]);

      let dbMatches = matchesRes.data as Match[] || [];
      if (teamsRes.data) setTeams(teamsRes.data);

      // 2. Fetch API Matches
      try {
        const apiGroups = await flashscoreApi.getMatchesForDate(selectedDate);
        const apiMatchesRaw = apiGroups.flatMap(g => g.matches);

        const apiMatches: Match[] = apiMatchesRaw.map(m => {
             // Construct ISO string from selectedDate + startTime (HH:MM)
             let startDateTime = new Date().toISOString();
             if (m.startTime) {
                 startDateTime = `${selectedDate}T${m.startTime}:00`;
             }

             return {
                id: m.id,
                home_team_id: m.homeTeam.id,
                away_team_id: m.awayTeam.id,
                home_score: m.homeScore || 0,
                away_score: m.awayScore || 0,
                status: m.status,
                competition: m.competition,
                start_time: startDateTime,
                venue: m.venue,
                home_team: { id: m.homeTeam.id, name: m.homeTeam.name, logo_url: m.homeTeam.logo },
                away_team: { id: m.awayTeam.id, name: m.awayTeam.name, logo_url: m.awayTeam.logo },
                is_api_match: true
            };
        });

        // 3. Merge & Dedupe (Filter out API matches that appear to be in DB)
        // Heuristic: Same Home Team Name AND Same Date
        const dbMatchKeys = new Set(dbMatches.map(m => {
            const dateStr = new Date(m.start_time).toLocaleDateString('en-CA');
            return `${m.home_team?.name?.toLowerCase()}|${dateStr}`;
        }));

        const uniqueApiMatches = apiMatches.filter(m => {
            const dateStr = selectedDate; // API matches are requested for selectedDate
            const key = `${m.home_team?.name?.toLowerCase()}|${dateStr}`;
            return !dbMatchKeys.has(key);
        });

        // Combine DB matches + Unique API matches
        // Note: filteredMatches logic later will filter by date again, so we can just combine all here?
        // Wait, dbMatches contains ALL dates. apiMatches contains ONLY selectedDate.
        // If we combine them, filteredMatches will work fine.
        
        setMatches([...dbMatches, ...uniqueApiMatches]);

      } catch (apiError) {
        console.error("Failed to fetch API matches:", apiError);
        setMatches(dbMatches);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // If it's an API match (is_api_match=true), we treat it as a NEW insertion (create), 
      // even if we clicked "Edit" (Import).
      // But we need to ensure we create the teams first if they don't exist.
      
      // Helper to upsert team
      const upsertTeam = async (name: string, logo: string) => {
          const { data: existing } = await supabase.from('teams').select('id').eq('name', name).maybeSingle();
          if (existing) return existing.id;
          const { data: newTeam, error } = await supabase.from('teams').insert({ name, logo_url: logo }).select('id').single();
          if (error) throw error;
          return newTeam.id;
      };

      // If we are "editing" an API match, we need to ensure teams exist in DB first
      let homeTeamId = formData.home_team_id;
      let awayTeamId = formData.away_team_id;

      // If ID is not a valid UUID (likely from API), or just to be safe if we are importing
      if (editingMatch?.is_api_match) {
           if (editingMatch.home_team) {
               homeTeamId = await upsertTeam(editingMatch.home_team.name, editingMatch.home_team.logo_url);
           }
           if (editingMatch.away_team) {
               awayTeamId = await upsertTeam(editingMatch.away_team.name, editingMatch.away_team.logo_url);
           }
           // Update formData with real DB IDs
           formData.home_team_id = homeTeamId;
           formData.away_team_id = awayTeamId;
      }

      if (editingMatch && !editingMatch.is_api_match) {
        // Normal Update
        const { error } = await supabase
          .from('matches')
          .update(formData)
          .eq('id', editingMatch.id);
        if (error) throw error;
      } else {
        // Create (New or Import API Match)
        const { error } = await supabase
          .from('matches')
          .insert([{
             ...formData,
             home_team_id: homeTeamId,
             away_team_id: awayTeamId
          }]);
        if (error) throw error;
      }
      setIsModalOpen(false);
      setEditingMatch(null);
      fetchData(); // Refresh to see the new DB match (and API match should disappear due to deduping)
    } catch (error) {
      console.error('Error saving match:', error);
      alert('Failed to save match');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this match?')) return;
    try {
      const { error } = await supabase.from('matches').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting match:', error);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      // selectedDate is "YYYY-MM-DD" which is local time date string.
      // new Date("YYYY-MM-DD") creates UTC midnight.
      // We want to pass a Date object that represents that day.
      // The syncMatchesFromFlashscore uses the date to extract YYYY-MM-DD again, so passing new Date(selectedDate) is fine IF it parses correctly.
      // To be safe, let's pass the date object constructed from parts.
      const [year, month, day] = selectedDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      
      const result = await syncMatchesFromFlashscore(date);
      if (result.success) {
        alert(`Successfully synced ${result.count} matches from Flashscore!`);
        fetchData();
      } else {
        alert('Failed to sync matches: ' + result.error);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Error syncing matches');
    } finally {
      setSyncing(false);
    }
  };

  const openEditModal = (match: Match) => {
    setEditingMatch(match);
    setFormData({
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      home_score: match.home_score,
      away_score: match.away_score,
      status: match.status,
      competition: match.competition,
      start_time: match.start_time,
      stream_url: match.stream_url || '',
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingMatch(null);
    setFormData({
      home_team_id: teams[0]?.id || '',
      away_team_id: teams[1]?.id || '',
      home_score: 0,
      away_score: 0,
      status: 'upcoming',
      competition: 'Premier League',
      start_time: new Date().toISOString().slice(0, 16),
      stream_url: '',
    });
    setIsModalOpen(true);
  };

  const filteredMatches = matches.filter(m => {
    // Search Filter
    const matchesSearch = 
      m.competition.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.home_team?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.away_team?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Date Filter
    // Note: Assuming app is used in local timezone. We compare the local date string.
    const matchDate = new Date(m.start_time).toLocaleDateString('en-CA'); // YYYY-MM-DD format
    const isSameDate = matchDate === selectedDate;

    return matchesSearch && isSameDate;
  });

  // Group matches by status for the view
  const liveMatches = filteredMatches.filter(m => m.status === 'live');
  const upcomingMatches = filteredMatches.filter(m => m.status === 'upcoming');
  const finishedMatches = filteredMatches.filter(m => m.status === 'finished');

  const MatchCard = ({ match }: { match: Match }) => (
    <Card className="group overflow-hidden border-slate-200 hover:border-blue-200 hover:shadow-lg transition-all duration-300">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {match.competition}
          </div>
          <span className={cn(
            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border",
            match.status === 'live' ? "bg-red-50 text-red-600 border-red-100 animate-pulse" :
            match.status === 'finished' ? "bg-slate-100 text-slate-600 border-slate-200" :
            "bg-blue-50 text-blue-600 border-blue-100"
          )}>
            {match.status}
          </span>
        </div>
        
        <div className="flex items-center justify-between mt-4">
          <div className="flex flex-col items-center flex-1">
              <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-2 shadow-sm text-lg font-bold text-slate-700">
                {match.home_team?.name.charAt(0)}
              </div>
              <span className="text-sm font-bold text-slate-800 text-center line-clamp-1 w-full px-1">{match.home_team?.name}</span>
          </div>
          
          <div className="flex flex-col items-center px-4">
            <div className="text-2xl font-black text-slate-900 tracking-tighter bg-slate-100 px-3 py-1 rounded-lg">
              {match.home_score} : {match.away_score}
            </div>
            <div className="text-[10px] font-medium text-slate-400 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(match.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
          </div>

          <div className="flex flex-col items-center flex-1">
              <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-2 shadow-sm text-lg font-bold text-slate-700">
                {match.away_team?.name.charAt(0)}
              </div>
              <span className="text-sm font-bold text-slate-800 text-center line-clamp-1 w-full px-1">{match.away_team?.name}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 bg-white">
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {match.venue ? <span className="truncate max-w-[150px]">{match.venue}</span> : <span>No Venue Info</span>}
            </div>
            {match.stream_url && (
              <div className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-md">
                <Video className="h-3 w-3" /> Stream Ready
              </div>
            )}
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200" onClick={() => openEditModal(match)}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit Details
          </Button>
          <Button variant="ghost" size="sm" className="px-3 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(match.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Match Management</h1>
          <p className="text-slate-500 mt-1">Create, edit, and manage live matches and streams.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleSync} disabled={syncing} variant="outline" className="flex-1 sm:flex-none border-blue-200 text-blue-700 hover:bg-blue-50 shadow-sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> 
            {syncing ? 'Syncing...' : 'Sync Flashscore'}
          </Button>
          <Button onClick={openCreateModal} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20">
            <Plus className="mr-2 h-4 w-4" /> Add Match
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search matches, teams, or competitions..." 
            className="pl-9 bg-white border-slate-200"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-9 w-full sm:w-auto bg-white border-slate-200"
            />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2 text-slate-600" onClick={() => setSelectedDate(new Date().toLocaleDateString('en-CA'))}>
            Today
          </Button>
          <Button variant="outline" className="flex items-center gap-2 text-slate-600" onClick={() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            setSelectedDate(tomorrow.toLocaleDateString('en-CA'));
          }}>
            Tomorrow
          </Button>
        </div>
      </div>

      {/* Match Sections */}
      <div className="space-y-8">
        {/* Live Matches */}
        {liveMatches.length > 0 && (
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <h2 className="text-xl font-bold text-slate-800">Live Now</h2>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {liveMatches.map(match => <MatchCard key={match.id} match={match} />)}
                </div>
            </section>
        )}

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
            <section>
                <h2 className="text-xl font-bold text-slate-800 mb-4">Upcoming Matches</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {upcomingMatches.map(match => <MatchCard key={match.id} match={match} />)}
                </div>
            </section>
        )}

        {/* Finished Matches */}
        {finishedMatches.length > 0 && (
            <section>
                <h2 className="text-xl font-bold text-slate-800 mb-4">Finished</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {finishedMatches.map(match => <MatchCard key={match.id} match={match} />)}
                </div>
            </section>
        )}

        {filteredMatches.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-slate-900">No matches found</h3>
                <p className="text-slate-500">No matches scheduled for {new Date(selectedDate).toLocaleDateString()}.</p>
                <Button variant="link" onClick={openCreateModal} className="mt-2 text-blue-600">
                    Schedule a match
                </Button>
            </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMatch ? "Edit Match Details" : "Schedule New Match"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Home Team</label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.home_team_id}
                onChange={(e) => setFormData({ ...formData, home_team_id: e.target.value })}
                required
              >
                <option value="">Select Team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Away Team</label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.away_team_id}
                onChange={(e) => setFormData({ ...formData, away_team_id: e.target.value })}
                required
              >
                <option value="">Select Team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
             <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Home Score</label>
              <Input
                type="number"
                value={formData.home_score}
                onChange={(e) => setFormData({ ...formData, home_score: parseInt(e.target.value) || 0 })}
                className="text-center font-bold"
              />
            </div>
            <div className="space-y-2">
               <label className="text-sm font-medium text-slate-700 text-center block">Status</label>
               <select
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              >
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="finished">Finished</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Away Score</label>
              <Input
                type="number"
                value={formData.away_score}
                onChange={(e) => setFormData({ ...formData, away_score: parseInt(e.target.value) || 0 })}
                className="text-center font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Competition</label>
            <Input
              value={formData.competition}
              onChange={(e) => setFormData({ ...formData, competition: e.target.value })}
              placeholder="e.g. Champions League"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Start Time</label>
              <Input
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Venue</label>
              <Input
                value={formData.venue || ''}
                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                placeholder="Stadium Name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Stream URL (Optional)</label>
            <Input
              value={formData.stream_url || ''}
              onChange={(e) => setFormData({ ...formData, stream_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
              {editingMatch ? 'Save Changes' : 'Create Match'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
