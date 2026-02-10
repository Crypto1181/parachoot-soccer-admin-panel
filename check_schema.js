
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tihykkycbhakjdmkxeeb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpaHlra3ljYmhha2pkbWt4ZWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNTU2MTUsImV4cCI6MjA4MzczMTYxNX0.qSZE4WNOR8Dqk3dVG3onvd2GqWHH3BkTeUHWLRZm58s';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchema() {
  console.log('Checking teams table...');
  const { data: teams, error } = await supabase
    .from('teams')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching teams:', error);
  } else if (teams && teams.length > 0) {
    console.log('Teams columns:', Object.keys(teams[0]));
  } else {
    console.log('No teams found. Trying to insert a dummy team to check error detail...');
    const { error: insertError } = await supabase.from('teams').insert({ name: 'Test Team' }).select();
    if (insertError) console.error('Insert error:', insertError);
  }
}

checkSchema();
