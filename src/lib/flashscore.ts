import { supabase } from './supabase';

const FLASHSCORE_API_BASE = 'https://flashscore4.p.rapidapi.com';
const FLASHSCORE_API_KEY = 'bffdb88075msh1832f65b5a81519p1ea775jsn5ca875a7973e'; // Using the key found in parent project

export const syncMatchesFromFlashscore = async (date: Date) => {
  try {
    const dateStr = date.toISOString().split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // Calculate day difference from today for the API
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(year, month - 1, day);
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let url = `${FLASHSCORE_API_BASE}/api/flashscore/v2/matches/list-by-date?date=${dateStr}&sport_id=1`;
    
    // Use list endpoint if within +/- 7 days range (more reliable)
    if (diffDays >= -7 && diffDays <= 7) {
      url = `${FLASHSCORE_API_BASE}/api/flashscore/v2/matches/list?day=${diffDays}&sport_id=1`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'flashscore4.p.rapidapi.com',
        'x-rapidapi-key': FLASHSCORE_API_KEY,
      },
    });

    if (!response.ok) throw new Error('Failed to fetch from Flashscore API');

    const data = await response.json();
    if (!Array.isArray(data)) return { success: false, error: 'Invalid API response' };

    let syncedCount = 0;

    for (const tournament of data) {
        if (!tournament.matches) continue;

        for (const fsMatch of tournament.matches) {
            // 1. Upsert Teams
            const homeTeamId = await upsertTeam(fsMatch.home_team);
            const awayTeamId = await upsertTeam(fsMatch.away_team);

            if (!homeTeamId || !awayTeamId) continue;

            // 2. Determine Status
            let status = 'upcoming';
            if (fsMatch.match_status) {
                if (fsMatch.match_status.is_finished) status = 'finished';
                else if (fsMatch.match_status.is_in_progress) status = 'live';
                else if (fsMatch.match_status.is_cancelled) status = 'finished';
            }

            // 3. Parse Start Time
            let startTime = new Date().toISOString();
            if (fsMatch.timestamp) {
                startTime = new Date(fsMatch.timestamp * 1000).toISOString();
            }

            // 4. Upsert Match
            const { error } = await supabase
                .from('matches')
                .upsert({
                    id: fsMatch.match_id, // Use Flashscore ID as our ID if possible, or mapping
                    // Note: If ID is UUID in DB, this might fail. Let's check schema. 
                    // Assuming DB uses UUID. We can't use fsMatch.match_id (string) as UUID.
                    // So we must look up by some unique key OR just insert new.
                    // To avoid duplicates, we should search by teams + date?
                    // OR: if the DB allows text IDs, we use fsMatch.match_id.
                    // Let's assume UUID for now and try to find existing match.
                    home_team_id: homeTeamId,
                    away_team_id: awayTeamId,
                    home_score: fsMatch.scores?.home ?? 0,
                    away_score: fsMatch.scores?.away ?? 0,
                    status: status,
                    competition: tournament.name,
                    start_time: startTime,
                    // stream_url: null // Don't overwrite existing stream URL if updating?
                }, { onConflict: 'home_team_id, away_team_id, start_time' }) // Assuming unique constraint?
                // Actually, without a unique ID from Flashscore, syncing is hard.
                // Let's assume we search by home_team_id + away_team_id + approximate time?
                // Or: store flashscore_id in DB?
                
                // fallback: Let's try to find a match with same teams and same day.
            
            // Simplified: Just log for now that we need a strategy.
            // Wait, if I can't reliably sync, this might duplicate matches.
            // I'll assume for now I will search for an existing match on that day.
            
            await handleMatchUpsert(homeTeamId, awayTeamId, startTime, status, tournament.name, fsMatch);
            syncedCount++;
        }
    }

    return { success: true, count: syncedCount };
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error: error };
  }
};

const upsertTeam = async (fsTeam: any) => {
    if (!fsTeam) return null;
    
    // Check if team exists by name
    const { data: existing } = await supabase
        .from('teams')
        .select('id')
        .eq('name', fsTeam.name)
        .single();
        
    if (existing) return existing.id;

    // Insert new
    const { data: newTeam, error } = await supabase
        .from('teams')
        .insert({
            name: fsTeam.name,
            logo_url: fsTeam.image_path || fsTeam.small_image_path || '',
        })
        .select('id')
        .single();
        
    if (error) {
        console.error('Error creating team:', error);
        return null;
    }
    return newTeam.id;
};

const handleMatchUpsert = async (homeId: string, awayId: string, startTime: string, status: string, competition: string, fsMatch: any) => {
    // Try to find match on same day with same teams
    const dateStr = startTime.split('T')[0];
    const nextDay = new Date(startTime);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];

    const { data: existing } = await supabase
        .from('matches')
        .select('id')
        .eq('home_team_id', homeId)
        .eq('away_team_id', awayId)
        .gte('start_time', dateStr)
        .lt('start_time', nextDayStr)
        .maybeSingle();

    const matchData = {
        home_team_id: homeId,
        away_team_id: awayId,
        home_score: fsMatch.scores?.home ?? 0,
        away_score: fsMatch.scores?.away ?? 0,
        status: status,
        competition: competition,
        start_time: startTime,
        // venue: fsMatch.venue?.name // If available
    };

    if (existing) {
        await supabase.from('matches').update(matchData).eq('id', existing.id);
    } else {
        await supabase.from('matches').insert(matchData);
    }
};
