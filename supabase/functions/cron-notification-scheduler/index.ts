import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  const startTime = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Init Supabase ───────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing env variables");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 2. Handle Calendar Events (Today and Tomorrow) ─────────────────────
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: events, error: eventsError } = await supabase
      .from("calendar_events")
      .select("*")
      .in("start_date", [todayStr, tomorrowStr]);

    if (eventsError) throw eventsError;

    const notificationsToInsert: any[] = [];

    if (events && events.length > 0) {
      for (const event of events) {
        const isToday = event.start_date === todayStr;
        const prefix = isToday ? "Today:" : "Tomorrow:";
        notificationsToInsert.push({
          school_id: event.school_id,
          target_role: 'all',
          title: `Upcoming Event ${prefix}`,
          body: `${event.title} is scheduled for ${event.start_date}. ${event.description || ''}`,
          route: '/calendar'
        });
      }
    }

    // ── 3. Handle Premium Plan Expirations (Mocking 'valid_upto' column) ────
    // Assumes `school_settings` has a `valid_upto` column or similar.
    // Replace 'valid_upto' with your actual expiry date column if it exists.
    /*
    const in5DaysStr = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
    const in1DayStr = new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0];
    
    const { data: expiringSchools } = await supabase
      .from("school_settings")
      .select("school_id, valid_upto")
      .in("valid_upto", [in5DaysStr, in1DayStr]);

    if (expiringSchools) {
      for (const school of expiringSchools) {
        notificationsToInsert.push({
          school_id: school.school_id,
          target_role: 'admin',
          title: 'Subscription Expiring Soon',
          body: `Your school subscription is expiring on ${school.valid_upto}. Please renew to avoid interruption.`,
          route: '/settings'
        });
      }
    }
    */

    // ── 4. Insert into Queue ───────────────────────────────────────────────
    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("app_notifications_queue")
        .insert(notificationsToInsert);
      
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      events_queued: notificationsToInsert.length 
    }), { headers: corsHeaders });

  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  } finally {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const duration = Date.now() - startTime;
        await supabaseAdmin.from("edge_function_usage").insert({
          function_name: "cron-notification-scheduler",
          execution_time_ms: duration
        });
      } catch (logErr: any) {
        console.error("Logging failed inside finally block:", logErr.message);
      }
    }
  }
});
