import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Eye, PlayCircle, TrendingUp, ArrowUpRight, Activity, Tv, Megaphone } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { supabase } from '@/lib/supabase';
import { flashscoreApi } from '@/lib/flashscoreApi';

const data = [
  { name: 'Mon', views: 4000, revenue: 2400 },
  { name: 'Tue', views: 3000, revenue: 1398 },
  { name: 'Wed', views: 2000, revenue: 9800 },
  { name: 'Thu', views: 2780, revenue: 3908 },
  { name: 'Fri', views: 1890, revenue: 4800 },
  { name: 'Sat', views: 2390, revenue: 3800 },
  { name: 'Sun', views: 3490, revenue: 4300 },
];

export default function Dashboard() {
  const [stats, setStats] = useState({
    liveMatches: 0,
    activeStreams: 0,
    activeAds: 0,
    totalRevenue: 45231.89 // Mock for now
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch DB Live Matches
        const { count: dbLiveMatchesCount } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'live');

        // 2. Fetch API Live Matches
        let apiLiveMatchesCount = 0;
        try {
            const apiGroups = await flashscoreApi.getLiveMatchesGrouped();
            apiLiveMatchesCount = apiGroups.reduce((acc, group) => acc + group.matches.length, 0);
        } catch (e) {
            console.error('Error fetching API live matches', e);
        }

        // 3. Fetch Active Streams (Live matches with stream_url AND started today)
        // We filter by date to avoid counting stale matches from previous days
        const { count: activeStreamsCount } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'live')
          .gte('start_time', today)
          .not('stream_url', 'is', null)
          .neq('stream_url', '');

        // Fetch Active Ads (Mock)
        const activeAdsCount = 12;

        setStats({
          liveMatches: (dbLiveMatchesCount || 0) + apiLiveMatchesCount,
          activeStreams: activeStreamsCount || 0,
          activeAds: activeAdsCount,
          totalRevenue: 45231.89
        });

      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      }
    };

    fetchStats();
    
    // Realtime subscription for matches
    const subscription = supabase
      .channel('dashboard_matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Overview</h1>
          <p className="text-slate-500 mt-1">Here's what's happening with your content today.</p>
        </div>
        <div className="flex gap-2">
           <button className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-white text-slate-900 hover:bg-slate-100 h-10 px-4 py-2 border border-slate-200 shadow-sm">
            Last 7 days
          </button>
          <button className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-slate-900 text-white hover:bg-slate-900/90 h-10 px-4 py-2 shadow-md">
            Download Report
          </button>
        </div>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Active Match Now</CardTitle>
                <div className="p-2 rounded-lg bg-emerald-50">
                    <Activity className="h-4 w-4 text-emerald-600" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-slate-900">{stats.liveMatches}</div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span className="text-emerald-600 font-medium flex items-center">
                        <ArrowUpRight className="h-3 w-3" />
                        +2
                    </span>
                    since last hour
                </p>
            </CardContent>
        </Card>

        <Card className="border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Active Match Stream</CardTitle>
                <div className="p-2 rounded-lg bg-blue-50">
                    <Tv className="h-4 w-4 text-blue-600" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-slate-900">{stats.activeStreams}</div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span className="text-emerald-600 font-medium flex items-center">
                        <ArrowUpRight className="h-3 w-3" />
                        +5
                    </span>
                    since last hour
                </p>
            </CardContent>
        </Card>

        <Card className="border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Active Ads</CardTitle>
                <div className="p-2 rounded-lg bg-amber-50">
                    <Megaphone className="h-4 w-4 text-amber-600" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-slate-900">{stats.activeAds}</div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span className="text-emerald-600 font-medium flex items-center">
                        <ArrowUpRight className="h-3 w-3" />
                        +12%
                    </span>
                    from yesterday
                </p>
            </CardContent>
        </Card>

        <Card className="border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Total Revenue</CardTitle>
                <div className="p-2 rounded-lg bg-purple-50">
                    <TrendingUp className="h-4 w-4 text-purple-600" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-slate-900">${stats.totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span className="text-emerald-600 font-medium flex items-center">
                        <ArrowUpRight className="h-3 w-3" />
                        +20.1%
                    </span>
                    from last month
                </p>
            </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-slate-100 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Revenue Overview</CardTitle>
                <p className="text-sm text-slate-500">Daily revenue performance</p>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <Activity className="h-4 w-4 text-slate-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `$${value}`} 
                  />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#2563eb" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 border-slate-100 shadow-sm">
          <CardHeader>
            <CardTitle>Daily Views</CardTitle>
            <p className="text-sm text-slate-500">Viewer engagement stats</p>
          </CardHeader>
          <CardContent>
            <div className="h-[350px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="views" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
