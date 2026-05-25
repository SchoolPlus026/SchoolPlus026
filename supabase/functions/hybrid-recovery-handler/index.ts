import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  // Build admin client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server configuration error: missing env vars', 500)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Parse body
  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    if (text) {
      body = JSON.parse(text)
    }
  } catch (_) {
    return errorResponse('Invalid JSON payload')
  }

  const { action, ...payload } = body as Record<string, unknown>

  if (!action || typeof action !== 'string') {
    return errorResponse('Missing or invalid action parameter')
  }

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. BRUTE-FORCE PROTECTION
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'check-brute-force') {
      const username = (payload.username as string | undefined)?.trim().toLowerCase()
      if (!username) return errorResponse('Username is required')

      const { data: log, error } = await supabaseAdmin
        .from('login_brute_force_logs')
        .select('*')
        .eq('username', username)
        .maybeSingle()

      if (error) {
        console.error('check-brute-force DB error:', error)
        // Fail open — don't block login on DB errors
        return jsonResponse({ locked: false })
      }

      if (log?.locked_until && new Date(log.locked_until) > new Date()) {
        return jsonResponse({ locked: true, lockedUntil: log.locked_until })
      }

      return jsonResponse({ locked: false })
    }

    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'log-failure') {
      const username = (payload.username as string | undefined)?.trim().toLowerCase()
      if (!username) return errorResponse('Username is required')

      const { data: log } = await supabaseAdmin
        .from('login_brute_force_logs')
        .select('*')
        .eq('username', username)
        .maybeSingle()

      let attempts = 1
      let lockedUntil: string | null = null

      if (log) {
        attempts = (log.failed_attempts as number) + 1
        if (attempts >= 5) {
          lockedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        }
        await supabaseAdmin
          .from('login_brute_force_logs')
          .update({ failed_attempts: attempts, locked_until: lockedUntil, last_attempt_at: new Date().toISOString() })
          .eq('username', username)
      } else {
        await supabaseAdmin
          .from('login_brute_force_logs')
          .insert({ username, failed_attempts: 1 })
      }

      return jsonResponse({ attempts, locked: attempts >= 5, lockedUntil })
    }

    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'reset-failures') {
      const username = (payload.username as string | undefined)?.trim().toLowerCase()
      if (!username) return errorResponse('Username is required')

      await supabaseAdmin
        .from('login_brute_force_logs')
        .delete()
        .eq('username', username)

      return jsonResponse({ success: true })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SCHOOL CODE RECOVERY
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'recover-school-code') {
      const name = (payload.name as string | undefined)?.trim()
      const role = payload.role as string | undefined
      const contact = (payload.contact as string | undefined)?.trim() || null
      const dob = payload.dob as string | undefined | null

      if (!name || !role) return errorResponse('Missing identity details')
      if (!contact && !dob) {
        return errorResponse('Please enter either your Registered Contact Number or Date of Birth.')
      }

      // Query by name (case-insensitive) and role
      const { data: users, error: usersErr } = await supabaseAdmin
        .from('users')
        .select('id, school_id, name, class, contact, dob')
        .ilike('name', name)
        .eq('role', role)

      if (usersErr) {
        console.error('recover-school-code users query error:', usersErr)
        return errorResponse('Server error during identity lookup. Please try again.')
      }
      if (!users || users.length === 0) {
        return errorResponse('We could not verify your identity. Please contact your school administration.')
      }

      // Perform matching in JS (allow either contact or DOB to match if both provided, soft match contact)
      let user = null
      for (const u of users) {
        let contactMatches = false
        let dobMatches = false

        if (contact && u.contact) {
          const cleanInput = contact.replace(/\D/g, '')
          const cleanDb = u.contact.replace(/\D/g, '')
          if (cleanInput && cleanDb && (cleanInput.endsWith(cleanDb) || cleanDb.endsWith(cleanInput))) {
            contactMatches = true
          }
        }

        if (dob && u.dob) {
          try {
            const inputDobStr = new Date(dob).toISOString().slice(0, 10)
            const dbDobStr = new Date(u.dob).toISOString().slice(0, 10)
            if (inputDobStr === dbDobStr) {
              dobMatches = true
            }
          } catch (_) {}
        }

        // If either matched, we choose this user
        if (contactMatches || dobMatches) {
          user = u
          break
        }
      }

      if (!user) {
        return errorResponse('We could not verify your identity. Please contact your school administration.')
      }

      let challengeQuestion = ''
      let options: string[] = []
      let correctAnswer = ''

      if (role === 'student') {
        challengeQuestion = 'Select your Class Teacher from the list below:'
        const { data: teachers } = await supabaseAdmin.from('users').select('name').eq('school_id', user.school_id).eq('role', 'teacher').eq('class', user.class).limit(1)
        const { data: randomTeachers } = await supabaseAdmin.from('users').select('name').eq('school_id', user.school_id).eq('role', 'teacher').neq('class', user.class).limit(2)
        correctAnswer = (teachers as { name: string }[])?.[0]?.name ?? 'Principal'
        options = [correctAnswer]
        if (randomTeachers) (randomTeachers as { name: string }[]).forEach(t => options.push(t.name))
        while (options.length < 3) options.push(`Teacher ${options.length + 1}`)
        options.sort(() => Math.random() - 0.5)
      } else if (role === 'teacher') {
        challengeQuestion = 'Select one of YOUR students from the list below:'
        const { data: students } = await supabaseAdmin.from('users').select('name').eq('school_id', user.school_id).eq('role', 'student').eq('class', user.class).limit(1)
        const { data: randomStudents } = await supabaseAdmin.from('users').select('name').eq('school_id', user.school_id).eq('role', 'student').neq('class', user.class).limit(2)
        correctAnswer = (students as { name: string }[])?.[0]?.name ?? 'Class Monitor'
        options = [correctAnswer]
        if (randomStudents) (randomStudents as { name: string }[]).forEach(s => options.push(s.name))
        while (options.length < 3) options.push(`Student ${options.length + 1}`)
        options.sort(() => Math.random() - 0.5)
      } else {
        challengeQuestion = 'Select the School Admin/Principal from the list below:'
        const { data: admins } = await supabaseAdmin.from('users').select('name').eq('school_id', user.school_id).eq('role', 'admin').limit(1)
        const { data: randomStaff } = await supabaseAdmin.from('users').select('name').eq('school_id', user.school_id).neq('role', 'admin').limit(2)
        correctAnswer = (admins as { name: string }[])?.[0]?.name ?? 'System Admin'
        options = [correctAnswer]
        if (randomStaff) (randomStaff as { name: string }[]).forEach(s => options.push(s.name))
        while (options.length < 3) options.push(`Staff ${options.length + 1}`)
        options.sort(() => Math.random() - 0.5)
      }

      const { data: session, error: sessErr } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .insert({
          user_id: user.id,
          school_id: user.school_id,
          saved_answers: { correctAnswer, step: 'school-code' }
        })
        .select()
        .single()

      if (sessErr) {
        console.error('recover-school-code session insert error:', sessErr)
        return errorResponse('Failed to create recovery session. Please try again.')
      }

      return jsonResponse({ challengeQuestion, options, sessionId: (session as { id: string }).id })
    }

    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'verify-school-code') {
      const sessionId = payload.sessionId as string | undefined
      const answer = payload.answer as string | undefined
      if (!sessionId || !answer) return errorResponse('Missing session details')

      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()

      if (error || !session) return errorResponse('Session expired or invalid')

      const saved = (session as { saved_answers: { step: string; correctAnswer: string } }).saved_answers
      if (saved?.step !== 'school-code' || saved?.correctAnswer !== answer) {
        return errorResponse('Verification failed. Incorrect answer.')
      }

      const { data: school, error: schoolErr } = await supabaseAdmin
        .from('school_settings')
        .select('school_code')
        .eq('school_id', (session as { school_id: string }).school_id)
        .maybeSingle()

      if (schoolErr || !school) return errorResponse('School settings not found')

      await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', sessionId)

      return jsonResponse({ schoolCode: (school as { school_code: string }).school_code })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. INITIATE RECOVERY (USERNAME OR PASSWORD)
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'initiate-recovery') {
      const credential_type = payload.credential_type as string | undefined
      const username_input = payload.username as string | undefined
      const password_input = payload.password as string | undefined
      const school_code = (payload.school_code as string | undefined)?.toUpperCase()
      const name_input = (payload.name as string | undefined)?.trim()
      const dob_input = payload.dob as string | undefined | null
      const contact_input = (payload.contact as string | undefined)?.trim() || null

      let userProfile: Record<string, unknown> | null = null

      if (credential_type === 'password') {
        if (!username_input || !school_code) return errorResponse('Missing Username or School Code')

        const { data: school, error: schoolErr } = await supabaseAdmin
          .from('school_settings').select('school_id').eq('school_code', school_code).maybeSingle()
        if (schoolErr || !school) return errorResponse('Invalid School Code')

        const { data: uProf } = await supabaseAdmin
          .from('users').select('*').eq('username', username_input.trim()).eq('school_id', (school as { school_id: string }).school_id).maybeSingle()
        if (!uProf) return errorResponse('Account not found')
        userProfile = uProf as Record<string, unknown>

      } else {
        // Recovering Username
        if (!password_input || !school_code || !name_input) {
          return errorResponse('Missing password or identity matching fields')
        }
        if (!contact_input && !dob_input) {
          return errorResponse('Please enter either your Registered Contact Number or Date of Birth.')
        }

        const { data: school, error: schoolErr } = await supabaseAdmin
          .from('school_settings').select('school_id').eq('school_code', school_code).maybeSingle()
        if (schoolErr || !school) return errorResponse('Invalid School Code')

        let query = supabaseAdmin
          .from('users').select('*').eq('name', name_input).eq('school_id', (school as { school_id: string }).school_id)
        if (dob_input) query = query.eq('dob', dob_input)
        if (contact_input) query = query.eq('contact', contact_input)

        const { data: usersMatching } = await query
        if (!usersMatching || (usersMatching as unknown[]).length === 0) {
          return errorResponse('We could not verify your identity. Please contact school office.')
        }

        const userCandidate = (usersMatching as Record<string, unknown>[])[0]
        const loginEmail = (userCandidate.email as string) || `${userCandidate.username}@school.com`

        const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
          email: loginEmail,
          password: password_input
        })

        if (authErr || !authData?.user) {
          return errorResponse('Incorrect password or credentials match failure.')
        }

        userProfile = userCandidate
      }

      // Check if recovery is locked
      const { data: recProfile } = await supabaseAdmin
        .from('recovery_profiles').select('*').eq('user_id', userProfile.id).maybeSingle()

      if (recProfile) {
        const rp = recProfile as { recovery_locked_until?: string }
        if (rp.recovery_locked_until && new Date(rp.recovery_locked_until) > new Date()) {
          const unlockTime = new Date(rp.recovery_locked_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          return errorResponse(`🔒 Account Recovery Locked: Recovery functions are frozen for 24 hours. Please try again after ${unlockTime}.`)
        }
      }

      // Build 5 questions
      type Question = { id: number; question: string; options: string[] }
      const questionsList: Question[] = []
      const answersMap: Record<number, string> = {}
      let qIndex = 1

      // Q1: DOB
      if (userProfile.dob) {
        const correctDob = new Date(userProfile.dob as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        questionsList.push({
          id: qIndex,
          question: 'Please verify your Date of Birth:',
          options: [
            correctDob,
            new Date(Date.now() - 5 * 365 * 24 * 3600000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            new Date(Date.now() - 15 * 365 * 24 * 3600000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          ].sort(() => Math.random() - 0.5)
        })
        answersMap[qIndex] = correctDob
        qIndex++
      }

      // Q2: Contact last 4 digits
      if (userProfile.contact) {
        const cleanContact = (userProfile.contact as string).trim()
        questionsList.push({
          id: qIndex,
          question: 'Verify the last 4 digits of your registered contact number:',
          options: [cleanContact.slice(-4), '1048', '9827'].sort(() => Math.random() - 0.5)
        })
        answersMap[qIndex] = cleanContact.slice(-4)
        qIndex++
      }

      // Q3/Q4: Role-based
      if (userProfile.role === 'student') {
        const { data: teacher } = await supabaseAdmin
          .from('users').select('name').eq('school_id', userProfile.school_id).eq('role', 'teacher').eq('class', userProfile.class).limit(1).maybeSingle()
        if (teacher) {
          const t = teacher as { name: string }
          questionsList.push({ id: qIndex, question: 'Who is your Class Teacher?', options: [t.name, 'Mr. Sharma (Math)', 'Mrs. Gupta (Hindi)'].sort(() => Math.random() - 0.5) })
          answersMap[qIndex] = t.name
          qIndex++
        }

        // Attendance: only ask within last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
        const { data: attendance } = await supabaseAdmin
          .from('attendance').select('attendance_data').eq('user_id', userProfile.id).limit(1).maybeSingle()
        if (attendance) {
          const ad = attendance as { attendance_data?: Record<string, string> }
          const allKeys = ad.attendance_data ? Object.keys(ad.attendance_data) : []
          // Filter to keys within last 7 days
          const recentKeys = allKeys.filter(k => new Date(k) >= sevenDaysAgo)
          if (recentKeys.length > 0) {
            const checkDate = recentKeys[recentKeys.length - 1] // most recent
            const realStatus = ad.attendance_data![checkDate]
            questionsList.push({ id: qIndex, question: `What was your attendance status on ${checkDate}?`, options: ['Present', 'Absent', 'On Leave'].sort(() => Math.random() - 0.5) })
            answersMap[qIndex] = realStatus
            qIndex++
          }
          // If no recent data, skip this question entirely (don't add it)
        }
      } else if (userProfile.role === 'teacher') {
        const { data: tt } = await supabaseAdmin
          .from('timetable').select('*').eq('teacher', String(userProfile.id)).limit(1).maybeSingle()
        if (tt) {
          const t = tt as { period_order: number; day: string; class: string }
          questionsList.push({ id: qIndex, question: `According to the timetable, which class do you teach during period ${t.period_order} on ${t.day}?`, options: [t.class, '5th A', '9th C'].sort(() => Math.random() - 0.5) })
          answersMap[qIndex] = t.class
          qIndex++
        }

        const { data: leave } = await supabaseAdmin
          .from('leaves').select('from_date').eq('user_id', userProfile.id).limit(1).maybeSingle()
        if (leave) {
          const l = leave as { from_date: string }
          questionsList.push({ id: qIndex, question: 'Select the start date of your last applied leave application:', options: [l.from_date, '2026-01-15', '2026-04-10'].sort(() => Math.random() - 0.5) })
          answersMap[qIndex] = l.from_date
          qIndex++
        }
      } else if (userProfile.role === 'driver') {
        const { data: bus } = await supabaseAdmin
          .from('bus_assignments').select('bus_number, route_name').eq('driver_id', userProfile.id).limit(1).maybeSingle()
        if (bus) {
          const b = bus as { bus_number: string }
          questionsList.push({ id: qIndex, question: 'What is your assigned School Bus Number?', options: [b.bus_number, 'Bus-08', 'Bus-12'].sort(() => Math.random() - 0.5) })
          answersMap[qIndex] = b.bus_number
          qIndex++
        }
      }

      // Fill from security questions in recProfile
      if (questionsList.length < 5 && recProfile) {
        const rp = recProfile as Record<string, string>
        if (rp.security_question_1 && rp.security_answer_1_hash) {
          questionsList.push({ id: qIndex, question: rp.security_question_1, options: [] })
          answersMap[qIndex] = rp.security_answer_1_hash
          qIndex++
        }
        if (questionsList.length < 5 && rp.security_question_2 && rp.security_answer_2_hash) {
          questionsList.push({ id: qIndex, question: rp.security_question_2, options: [] })
          answersMap[qIndex] = rp.security_answer_2_hash
          qIndex++
        }
      }

      // Fill generic questions to reach 5 — only add if data actually exists
      if (questionsList.length < 5) {
        // Principal name — only if admin exists
        const { data: principal } = await supabaseAdmin
          .from('users').select('name').eq('school_id', userProfile.school_id).eq('role', 'admin').limit(1).maybeSingle()
        if (principal && (principal as { name?: string }).name && questionsList.length < 5) {
          const principalName = (principal as { name: string }).name
          const fakeName1 = 'Mr. Verma'
          const fakeName2 = 'Mrs. Patel'
          questionsList.push({
            id: qIndex,
            question: "What is the name of your school's Admin/Principal?",
            options: [principalName, fakeName1, fakeName2].sort(() => Math.random() - 0.5)
          })
          answersMap[qIndex] = principalName
          qIndex++
        }
      }

      if (questionsList.length < 5) {
        // School state — only if state/city data exists in school_settings
        const { data: school } = await supabaseAdmin
          .from('school_settings').select('city, state').eq('school_id', userProfile.school_id).maybeSingle()
        const schoolState = (school as { city?: string; state?: string } | null)?.state || null
        if (schoolState) {
          questionsList.push({
            id: qIndex,
            question: 'Which state is your school located in?',
            options: [schoolState, 'Maharashtra', 'Gujarat'].sort(() => Math.random() - 0.5)
          })
          answersMap[qIndex] = schoolState
          qIndex++
        }
      }

      // Last resort: if still under 5, use a generic typed answer question
      if (questionsList.length < 5) {
        questionsList.push({
          id: qIndex,
          question: 'What is the name of your school? (Full name as registered)',
          options: [] // free-text answer
        })
        const { data: sch } = await supabaseAdmin
          .from('school_settings').select('name').eq('school_id', userProfile.school_id).maybeSingle()
        answersMap[qIndex] = (sch as { name?: string } | null)?.name ?? ''
        qIndex++
      }

      const finalQuestions = questionsList.slice(0, 5)

      const { data: session, error: sessErr } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .insert({
          user_id: userProfile.id,
          school_id: userProfile.school_id,
          saved_answers: { answersMap, credential_type }
        })
        .select()
        .single()

      if (sessErr) {
        console.error('initiate-recovery session insert error:', sessErr)
        return errorResponse('Failed to create recovery session. Please try again.')
      }

      return jsonResponse({ questions: finalQuestions, sessionId: (session as { id: string }).id })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. SUBMIT RECOVERY ANSWERS
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'submit-recovery-answers') {
      const sessionId = payload.sessionId as string | undefined
      const answers = payload.answers as Record<string, string> | undefined
      const newPassword = payload.newPassword as string | undefined | null

      if (!sessionId || !answers) return errorResponse('Missing session details')

      // Clean up expired sessions (non-blocking)
      supabaseAdmin.rpc('cleanup_expired_recovery_sessions').then(() => {}).catch(() => {})

      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions').select('*').eq('id', sessionId).maybeSingle()

      if (error || !session) return errorResponse('Recovery session has expired or is invalid. Please restart.')

      const s = session as {
        user_id: string; school_id: string; attempt_count: number;
        saved_answers: { answersMap: Record<string, string>; credential_type: string }
      }

      // Check recovery lockout on user profile
      const { data: recProfile } = await supabaseAdmin
        .from('recovery_profiles').select('*').eq('user_id', s.user_id).maybeSingle()

      if (recProfile) {
        const rp = recProfile as { recovery_locked_until?: string }
        if (rp.recovery_locked_until && new Date(rp.recovery_locked_until) > new Date()) {
          return errorResponse('This recovery session is locked. Please try again after 24 hours.')
        }
      }

      const { answersMap, credential_type } = s.saved_answers
      const incorrectQuestions: number[] = []

      for (const [idStr, realAns] of Object.entries(answersMap)) {
        const qId = parseInt(idStr)
        const userAns = (answers[qId] ?? '').trim().toLowerCase()
        if (userAns !== (realAns ?? '').trim().toLowerCase()) {
          incorrectQuestions.push(qId)
        }
      }

      if (incorrectQuestions.length > 0) {
        const newAttempts = s.attempt_count + 1
        let lockedUntil: string | null = null

        if (newAttempts >= 2) {
          lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          if (recProfile) {
            await supabaseAdmin.from('recovery_profiles').update({ recovery_locked_until: lockedUntil }).eq('user_id', s.user_id)
          } else {
            await supabaseAdmin.from('recovery_profiles').insert({ user_id: s.user_id, school_id: s.school_id, recovery_locked_until: lockedUntil })
          }
        }

        // Update attempt count in session
        await supabaseAdmin.from('recovery_ephemeral_sessions').update({ attempt_count: newAttempts }).eq('id', sessionId)

        const { data: uProfile } = await supabaseAdmin.from('users').select('role').eq('id', s.user_id).maybeSingle()
        const role = (uProfile as { role?: string } | null)?.role

        if (role === 'student') {
          // Students cannot retry — abort immediately
          await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', sessionId)
          return new Response(JSON.stringify({
            error: 'Verification aborted.',
            abort: true,
            message: 'Please contact your Class Teacher to reset your password.'
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
        }

        return new Response(JSON.stringify({
          error: 'Validation failed. Some answers were incorrect.',
          incorrectQuestions,
          attempts: newAttempts,
          locked: newAttempts >= 2,
          lockedUntil
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
      }

      // ─── SUCCESS ───────────────────────────────────────────────────────────

      if (credential_type === 'password') {
        if (!newPassword) return errorResponse('New password is required to complete recovery')
        if (newPassword.length < 6) return errorResponse('Password must be at least 6 characters long')

        const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(s.user_id, { password: newPassword })
        if (resetErr) {
          console.error('Password reset error:', resetErr)
          return errorResponse('Failed to update password. Please try again.')
        }

        await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', sessionId)

        // Send notification — non-fatal, wrapped in try-catch
        try {
          await supabaseAdmin.from('notifications').insert({
            school_id: s.school_id,
            to_user_id: s.user_id,
            message: 'Your account password was recently reset. If this was not you, lock your recovery options immediately from Settings.',
            link: '/settings',
            type: 'security_alert'
          })
        } catch (notifErr) {
          console.warn('Could not send security notification (non-fatal):', notifErr)
        }

        return jsonResponse({ success: true, message: 'Password updated successfully!' })

      } else {
        // Username recovery — return username
        const { data: uProfile, error: uProfileErr } = await supabaseAdmin
          .from('users').select('username').eq('id', s.user_id).maybeSingle()
        if (uProfileErr || !uProfile) return errorResponse('User profile not found')

        await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', sessionId)

        return jsonResponse({ success: true, username: (uProfile as { username: string }).username })
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. QR CODE DEVICE SYNC (REBUILT FOR ADMINS)
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'get-sync-questions') {
      const userId = payload.userId as string | undefined
      const clientPlatform = payload.clientPlatform as 'pc' | 'mobile' | undefined

      if (!userId || !clientPlatform) return errorResponse('Missing userId or clientPlatform.')

      // Check role constraint
      const { data: userRow, error: userErr } = await supabaseAdmin
        .from('users')
        .select('name, role, school_id, dob, contact, email')
        .eq('id', userId)
        .maybeSingle()

      if (userErr || !userRow) return errorResponse('User profile not found.')

      const uRole = (userRow.role || '').toLowerCase()
      if (uRole !== 'admin' && uRole !== 'platform_admin') {
        return errorResponse('Unauthorized: Sync login is only available for Admins.')
      }

      const hasDob = !!userRow.dob
      const hasContact = !!userRow.contact

      // If DB lacks basic info, skip questions and generate directly
      if (!hasDob && !hasContact) {
        const displayCode = Math.floor(100000 + Math.random() * 900000).toString()
        const qrToken = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

        const flow = clientPlatform === 'pc' ? 'pc-to-mobile' : 'mobile-to-pc'

        const { error: insertErr } = await supabaseAdmin
          .from('recovery_ephemeral_sessions')
          .insert({
            user_id: userId,
            school_id: userRow.school_id,
            qr_token: clientPlatform === 'pc' ? qrToken : displayCode,
            qr_verified: false,
            expires_at: expiresAt,
            saved_answers: { displayCode, flow, requiresPasswordChange: true }
          })

        if (insertErr) {
          console.error('get-sync-questions skip-insert error:', insertErr)
          return errorResponse('Failed to generate sync code. Please try again.')
        }

        return jsonResponse({
          skipVerification: true,
          displayCode,
          qrToken: clientPlatform === 'pc' ? qrToken : undefined,
          expiresAt
        })
      }

      // Generate verification questions
      // Question 1: MCQ "Identify the Staff"
      const { data: staffList } = await supabaseAdmin
        .from('users')
        .select('name')
        .eq('school_id', userRow.school_id)
        .in('role', ['admin', 'teacher', 'staff', 'app_manager'])
        .neq('id', userId)
        .limit(10)

      let correctStaff = userRow.name || 'Admin'
      if (staffList && staffList.length > 0) {
        correctStaff = staffList[Math.floor(Math.random() * staffList.length)].name
      }

      const { data: studentList } = await supabaseAdmin
        .from('users')
        .select('name')
        .eq('school_id', userRow.school_id)
        .eq('role', 'student')
        .limit(10)

      let studentNames: string[] = []
      if (studentList && studentList.length > 0) {
        const shuffled = [...studentList].sort(() => Math.random() - 0.5)
        studentNames = shuffled.slice(0, 2).map(s => s.name)
      }
      while (studentNames.length < 2) {
        studentNames.push(`Student ${studentNames.length + 1}`)
      }

      const mcqOptions = [correctStaff, ...studentNames].sort(() => Math.random() - 0.5)

      // Question 2: Dynamic Info (DOB or Contact)
      let dynamicType = 'dob'
      let dynamicQuestion = 'Verify your Date of Birth (YYYY-MM-DD)'
      let correctDynamicValue = userRow.dob ? new Date(userRow.dob).toISOString().slice(0, 10) : ''

      if (!hasDob && hasContact) {
        dynamicType = 'contact'
        dynamicQuestion = 'Verify your registered Contact Number'
        correctDynamicValue = userRow.contact ? userRow.contact.trim() : ''
      }

      // Store pre-verification session
      const verificationSessionId = crypto.randomUUID()
      const { error: insertErr } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .insert({
          user_id: userId,
          school_id: userRow.school_id,
          qr_token: verificationSessionId,
          qr_verified: false,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          saved_answers: {
            flow: 'pre-sync-verification',
            correctStaff,
            correctDynamicValue,
            dynamicType
          }
        })

      if (insertErr) {
        console.error('get-sync-questions insert error:', insertErr)
        return errorResponse('Failed to prepare verification questions.')
      }

      return jsonResponse({
        skipVerification: false,
        sessionId: verificationSessionId,
        mcqQuestion: {
          question: 'Identify the Staff from the options below:',
          options: mcqOptions
        },
        dynamicQuestion: {
          type: dynamicType,
          question: dynamicQuestion
        }
      })
    }

    if (action === 'verify-sync-questions') {
      const sessionId = payload.sessionId as string | undefined
      const staffAnswer = payload.staffAnswer as string | undefined
      const dynamicAnswer = payload.dynamicAnswer as string | undefined
      const clientPlatform = payload.clientPlatform as 'pc' | 'mobile' | undefined

      if (!sessionId || !staffAnswer || !dynamicAnswer || !clientPlatform) {
        return errorResponse('Missing verification parameters.')
      }

      const { data: session, error: sessErr } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('qr_token', sessionId)
        .maybeSingle()

      if (sessErr || !session) return errorResponse('Verification session expired or invalid.')

      const s = session as {
        id: string; user_id: string; school_id: string; expires_at: string;
        saved_answers?: { flow?: string; correctStaff?: string; correctDynamicValue?: string; dynamicType?: string }
      }

      if (s.saved_answers?.flow !== 'pre-sync-verification') {
        return errorResponse('Invalid verification session.')
      }

      if (new Date(s.expires_at) < new Date()) {
        await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', s.id)
        return errorResponse('Verification session has expired.')
      }

      // Verify MCQ Staff
      if (staffAnswer !== s.saved_answers.correctStaff) {
        return errorResponse('Incorrect staff selection.')
      }

      // Verify Dynamic Info
      let dynamicVerified = false
      const inputVal = dynamicAnswer.trim()
      const dbVal = s.saved_answers.correctDynamicValue || ''

      if (s.saved_answers.dynamicType === 'dob') {
        try {
          if (new Date(inputVal).toISOString().slice(0, 10) === new Date(dbVal).toISOString().slice(0, 10)) {
            dynamicVerified = true
          }
        } catch (_) {}
      } else {
        // Clean non-digits
        if (inputVal.replace(/\D/g, '') === dbVal.replace(/\D/g, '')) {
          dynamicVerified = true
        }
      }

      if (!dynamicVerified) {
        return errorResponse('Incorrect answer for personal profile question.')
      }

      // Clean up verification session
      await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', s.id)

      // Generate final sync code/session
      const displayCode = Math.floor(100000 + Math.random() * 900000).toString()
      const qrToken = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

      const flow = clientPlatform === 'pc' ? 'pc-to-mobile' : 'mobile-to-pc'

      const { error: insertErr } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .insert({
          user_id: s.user_id,
          school_id: s.school_id,
          qr_token: clientPlatform === 'pc' ? qrToken : displayCode,
          qr_verified: false,
          expires_at: expiresAt,
          saved_answers: { displayCode, flow, requiresPasswordChange: true }
        })

      if (insertErr) {
        console.error('verify-sync-questions final insert error:', insertErr)
        return errorResponse('Failed to generate final sync code.')
      }

      return jsonResponse({
        success: true,
        displayCode,
        qrToken: clientPlatform === 'pc' ? qrToken : undefined,
        expiresAt
      })
    }

    if (action === 'qr-mobile-login') {
      const displayCode = payload.displayCode as string | undefined
      const qrToken = payload.qrToken as string | undefined

      if (!displayCode && !qrToken) {
        return errorResponse('Please scan the QR code or enter the 6-digit sync code.')
      }

      let matchedSession = null

      if (qrToken) {
        const { data: session } = await supabaseAdmin
          .from('recovery_ephemeral_sessions')
          .select('*')
          .eq('qr_token', qrToken)
          .eq('qr_verified', false)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        if (session) {
          const s = session as { saved_answers?: { flow?: string } }
          if (s.saved_answers?.flow === 'pc-to-mobile') {
            matchedSession = session
          }
        }
      } else if (displayCode) {
        const { data: sessions } = await supabaseAdmin
          .from('recovery_ephemeral_sessions')
          .select('*')
          .eq('qr_verified', false)
          .gt('expires_at', new Date().toISOString())

        if (sessions) {
          type SessionRow = { id: string; user_id: string | null; saved_answers?: { displayCode?: string; flow?: string } }
          matchedSession = (sessions as SessionRow[]).find(s => s.saved_answers?.displayCode === displayCode && s.saved_answers?.flow === 'pc-to-mobile')
        }
      }

      if (!matchedSession || !matchedSession.user_id) {
        return errorResponse('Code/QR has expired or is invalid. Please try again.')
      }

      // Clean up the session
      await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', matchedSession.id)

      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('email, username, role')
        .eq('id', matchedSession.user_id)
        .maybeSingle()

      if (!userRow) return errorResponse('User profile not found.')

      const u = userRow as { email?: string; username?: string; role?: string }
      const uRole = (u.role || '').toLowerCase()
      if (uRole !== 'admin' && uRole !== 'platform_admin') {
        return errorResponse('Unauthorized: Sync login is only available for Admins.')
      }

      const emailToUse = u.email || `${matchedSession.user_id}@school.com`

      const { data: otpLink, error: otpErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: emailToUse
      })

      if (otpErr) {
        console.error('qr-mobile-login magic link error:', otpErr)
        return errorResponse('Failed to create mobile login session. Please try again.')
      }

      const actionLink = otpLink.properties.action_link
      let tokenHash = ''
      try {
        const parsedUrl = new URL(actionLink)
        tokenHash = parsedUrl.searchParams.get('token') || ''
      } catch (e) {
        console.error('Error parsing action_link URL:', e)
      }

      return jsonResponse({
        success: true,
        loginUrl: actionLink,
        tokenHash: tokenHash,
        requiresPasswordChange: true
      })
    }

    if (action === 'qr-pc-login') {
      const displayCode = payload.displayCode as string | undefined
      if (!displayCode) return errorResponse('Please enter the 6-digit sync code.')

      const { data: sessions } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('qr_verified', false)
        .gt('expires_at', new Date().toISOString())

      if (!sessions || sessions.length === 0) {
        return errorResponse('Code not found or expired. Please generate a new code on your mobile app.')
      }

      type SessionRow = { id: string; user_id: string | null; saved_answers?: { displayCode?: string; flow?: string } }
      const matched = (sessions as SessionRow[]).find(s => s.saved_answers?.displayCode === displayCode && s.saved_answers?.flow === 'mobile-to-pc')

      if (!matched || !matched.user_id) {
        return errorResponse('Invalid or expired code. Please generate a new code on your mobile app.')
      }

      await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', matched.id)

      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('email, username, role')
        .eq('id', matched.user_id)
        .maybeSingle()

      if (!userRow) return errorResponse('User profile not found.')

      const u = userRow as { email?: string; username?: string; role?: string }
      const uRole = (u.role || '').toLowerCase()
      if (uRole !== 'admin' && uRole !== 'platform_admin') {
        return errorResponse('Unauthorized: Sync login is only available for Admins.')
      }

      const emailToUse = u.email || `${matched.user_id}@school.com`

      const { data: otpLink, error: otpErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: emailToUse
      })

      if (otpErr) {
        console.error('qr-pc-login magic link error:', otpErr)
        return errorResponse('Failed to create PC login session. Please try again.')
      }

      const actionLink = otpLink.properties.action_link
      let tokenHash = ''
      try {
        const parsedUrl = new URL(actionLink)
        tokenHash = parsedUrl.searchParams.get('token') || ''
      } catch (e) {
        console.error('Error parsing action_link URL:', e)
      }

      return jsonResponse({
        success: true,
        loginUrl: actionLink,
        tokenHash: tokenHash,
        requiresPasswordChange: true
      })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5b. PEER-TO-PEER TEACHER ASSIST — generate-colleague-token
    // A logged-in teacher generates a 6-digit OTP for a locked-out colleague
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'generate-colleague-token') {
      const helperUserId = payload.helperUserId as string | undefined
      const colleagueUsername = (payload.colleagueUsername as string | undefined)?.trim()
      const password = payload.password as string | undefined
      const pin = payload.pin as string | undefined

      if (!helperUserId || !colleagueUsername) return errorResponse('Missing required fields.')
      if (!password && !pin) {
        return errorResponse('Identity verification required. Please enter your password or recovery PIN.')
      }

      // Verify helper exists and is teacher/staff (not student/driver)
      const { data: helperProfile, error: helperErr } = await supabaseAdmin
        .from('users').select('role, school_id, name, email').eq('id', helperUserId).maybeSingle()

      if (helperErr || !helperProfile) return errorResponse('Your account could not be verified. Please try again.')

      const h = helperProfile as { role: string; school_id: string; name: string; email?: string }
      const allowedHelperRoles = ['teacher', 'staff', 'admin']
      if (!allowedHelperRoles.includes(h.role)) {
        return errorResponse('Only teachers and staff members can generate colleague reset tokens.')
      }

      // Verify helper identity
      if (password) {
        const helperEmail = h.email || `${helperUserId}@school.com`
        const { error: authErr } = await supabaseAdmin.auth.signInWithPassword({
          email: helperEmail,
          password: password
        })
        if (authErr) {
          return errorResponse('Incorrect password. Identity verification failed.')
        }
      } else if (pin) {
        const { data: recProfile, error: recErr } = await supabaseAdmin
          .from('recovery_profiles').select('pin_hash').eq('user_id', helperUserId).maybeSingle()
        
        if (recErr || !recProfile || !(recProfile as { pin_hash?: string }).pin_hash) {
          return errorResponse('No Recovery PIN is set on your account. Please verify with your Password instead.')
        }
        if ((recProfile as { pin_hash?: string }).pin_hash !== pin.trim()) {
          return errorResponse('Incorrect Recovery PIN. Identity verification failed.')
        }
      }

      // Find the colleague in the SAME school
      const { data: colleague, error: colErr } = await supabaseAdmin
        .from('users').select('id, name, role, school_id').ilike('username', colleagueUsername).eq('school_id', h.school_id).maybeSingle()

      if (colErr || !colleague) {
        return errorResponse(`No account found for username "${colleagueUsername}" in your school.`)
      }

      const c = colleague as { id: string; name: string; role: string; school_id: string }

      // Students cannot be helped via peer-to-peer (security policy)
      if (c.role === 'student') {
        return errorResponse('Students are not eligible for peer-assisted recovery. Please contact your school Admin.')
      }

      // Cannot generate token for yourself
      if (c.id === helperUserId) {
        return errorResponse('You cannot generate a reset token for yourself. Use the normal recovery options.')
      }

      // Generate 6-digit numeric token
      const token = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes

      // Store in ephemeral sessions
      const { error: insertErr } = await supabaseAdmin.from('recovery_ephemeral_sessions').insert({
        user_id: c.id,
        school_id: c.school_id,
        qr_token: token, // reuse qr_token column for the OTP
        qr_verified: false,
        expires_at: expiresAt,
        saved_answers: {
          flow: 'colleague-token',
          helperUserId,
          helperName: h.name,
          colleagueName: c.name
        }
      })

      if (insertErr) {
        console.error('generate-colleague-token insert error:', insertErr)
        return errorResponse('Failed to generate token. Please try again.')
      }

      return jsonResponse({
        success: true,
        token,
        colleagueName: c.name,
        colleagueRole: c.role,
        expiresAt
      })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5c. PEER-TO-PEER TEACHER ASSIST — colleague-token-login
    // Locked-out user enters the 6-digit token from their colleague
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'colleague-token-login') {
      const token = (payload.token as string | undefined)?.trim()
      const newPassword = payload.newPassword as string | undefined

      if (!token) return errorResponse('Please enter the 6-digit token given to you by your colleague.')
      if (!newPassword) return errorResponse('Please enter your new password.')
      if (newPassword.length < 6) return errorResponse('Password must be at least 6 characters.')

      // Find the session by token
      const { data: session, error: sessErr } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('qr_token', token)
        .eq('qr_verified', false)
        .maybeSingle()

      if (sessErr || !session) return errorResponse('Invalid or expired token. Please ask your colleague to generate a new one.')

      const s = session as {
        id: string; user_id: string; expires_at: string;
        saved_answers?: { flow?: string; helperName?: string; colleagueName?: string }
      }

      if (s.saved_answers?.flow !== 'colleague-token') {
        return errorResponse('This token is not valid for colleague-assisted login.')
      }

      if (new Date(s.expires_at) < new Date()) {
        await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', s.id)
        return errorResponse('This token has expired (tokens are valid for 30 minutes). Please ask your colleague to generate a new one.')
      }

      // Reset the password
      const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(s.user_id, { password: newPassword })

      if (resetErr) {
        console.error('colleague-token-login password reset error:', resetErr)
        return errorResponse('Failed to reset your password. Please try again or contact your Admin.')
      }

      // Clean up the used session
      await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('id', s.id)

      // Non-fatal security notification
      try {
        const { data: userRow } = await supabaseAdmin.from('users').select('school_id').eq('id', s.user_id).maybeSingle()
        await supabaseAdmin.from('notifications').insert({
          school_id: (userRow as { school_id?: string } | null)?.school_id,
          to_user_id: s.user_id,
          message: `Your password was reset by a colleague (${s.saved_answers?.helperName ?? 'Unknown'}). If this was not expected, contact your school Admin.`,
          link: '/settings',
          type: 'security_alert'
        })
      } catch (_) { /* non-fatal */ }

      return jsonResponse({ success: true, message: 'Password reset successfully! Please login with your new password.' })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. FAST-TRACK SIMPLE PIN RECOVERY
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'pin-recovery-verify') {
      const credential_type = payload.credential_type as string | undefined
      const school_code = (payload.school_code as string | undefined)?.toUpperCase()
      const pin = (payload.pin as string | undefined)?.trim()
      const dob = payload.dob as string | undefined | null
      const contact = (payload.contact as string | undefined)?.trim() || null
      const newPassword = payload.newPassword as string | undefined | null
      const username_input = (payload.username as string | undefined)?.trim()
      const name_input = (payload.name as string | undefined)?.trim()
      const role_input = payload.role as string | undefined
      const dryRun = payload.dryRun === true // Step 1 of 2-step flow: verify only, no password change

      if (!credential_type || !school_code || !pin) return errorResponse('Missing required fields: school code and recovery PIN are required.')
      if (pin.length !== 6 || !/^\d+$/.test(pin)) return errorResponse('Recovery PIN must be exactly 6 digits.')
      if (!dob && !contact) return errorResponse('Please provide either your Date of Birth or Contact Number.')

      const { data: school, error: schoolErr } = await supabaseAdmin
        .from('school_settings').select('school_id').eq('school_code', school_code).maybeSingle()
      if (schoolErr || !school) return errorResponse('Invalid School Code.')

      const schoolId = (school as { school_id: string }).school_id
      let userProfile: Record<string, unknown> | null = null

      if (credential_type === 'password') {
        if (!username_input) return errorResponse('Please enter your Username.')
        const { data: uProf } = await supabaseAdmin.from('users').select('*').ilike('username', username_input).eq('school_id', schoolId).maybeSingle()
        if (!uProf) return errorResponse('No account found with this username in this school.')
        userProfile = uProf as Record<string, unknown>
      } else {
        if (!name_input) return errorResponse('Please enter your Full Name.')
        let q = supabaseAdmin.from('users').select('*').ilike('name', name_input).eq('school_id', schoolId)
        if (role_input) q = q.eq('role', role_input)
        const { data: usersFound } = await q
        if (!usersFound || (usersFound as unknown[]).length === 0) return errorResponse('No account found matching your name in this school.')
        userProfile = (usersFound as Record<string, unknown>[])[0]
      }

      let identityVerified = false
      if (dob && userProfile.dob === dob) identityVerified = true
      if (contact && userProfile.contact && (userProfile.contact as string).trim() === contact) identityVerified = true
      if (!identityVerified) return errorResponse('Date of Birth or Contact Number does not match our records.')

      const { data: recProfile } = await supabaseAdmin
        .from('recovery_profiles').select('*').eq('user_id', userProfile.id).maybeSingle()

      if (!recProfile) return errorResponse('No Recovery PIN is set on this account. Please use the "Answer Questions" method instead.')

      const rp = recProfile as { recovery_locked_until?: string; pin_hash?: string }
      if (rp.recovery_locked_until && new Date(rp.recovery_locked_until) > new Date()) {
        const unlockTime = new Date(rp.recovery_locked_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return errorResponse(`🔒 Recovery is locked until ${unlockTime}. Please try later.`)
      }

      if (!rp.pin_hash) return errorResponse('No Recovery PIN is set on this account. Please use the "Answer Questions" method instead.')

      if (rp.pin_hash !== pin) {
        const lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        await supabaseAdmin.from('recovery_profiles').update({ recovery_locked_until: lockUntil }).eq('user_id', userProfile.id)
        return errorResponse('Incorrect Recovery PIN. Recovery has been locked for 24 hours to protect your account.')
      }

      // ── DRY RUN: verification only (Step 1 of 2-step flow) ──
      if (dryRun) {
        return jsonResponse({ success: true, verified: true })
      }

      if (credential_type === 'password') {
        if (!newPassword) return errorResponse('Please enter a new password.')
        if (newPassword.length < 6) return errorResponse('Password must be at least 6 characters.')

        const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(userProfile.id as string, { password: newPassword })
        if (resetErr) {
          console.error('pin-recovery password reset error:', resetErr)
          return errorResponse('Failed to update password. Please try again.')
        }

        await supabaseAdmin.from('recovery_profiles').update({ recovery_locked_until: null }).eq('user_id', userProfile.id)

        try {
          await supabaseAdmin.from('notifications').insert({
            school_id: userProfile.school_id, to_user_id: userProfile.id,
            message: 'Your password was reset using your Recovery PIN. If this was not you, contact your school admin immediately.',
            link: '/settings', type: 'security_alert'
          })
        } catch (_) { /* non-fatal */ }

        return jsonResponse({ success: true, message: 'Password updated successfully!' })
      } else {
        return jsonResponse({ success: true, username: userProfile.username as string })
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. RECOVERY LOCKING ("It's Not Me")
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'lock-recovery') {
      const userId = payload.userId as string | undefined
      if (!userId) return errorResponse('Missing user parameter')

      const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      const { data: recProfile } = await supabaseAdmin
        .from('recovery_profiles').select('*').eq('user_id', userId).maybeSingle()

      if (recProfile) {
        await supabaseAdmin.from('recovery_profiles').update({ recovery_locked_until: lockedUntil }).eq('user_id', userId)
      } else {
        const { data: userProfile, error: userProfileErr } = await supabaseAdmin
          .from('users').select('school_id').eq('id', userId).maybeSingle()
        if (userProfileErr || !userProfile) return errorResponse('User profile not found')

        await supabaseAdmin.from('recovery_profiles').insert({
          user_id: userId,
          school_id: (userProfile as { school_id: string }).school_id,
          recovery_locked_until: lockedUntil
        })
      }

      return jsonResponse({ success: true, lockedUntil })
    }

    // Unknown action
    return errorResponse(`Unsupported action: ${action}`)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected server error occurred.'
    console.error(`hybrid-recovery-handler [${action}] unhandled error:`, err)
    return errorResponse(message, 500)
  }
})
