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

      let query = supabaseAdmin
        .from('users')
        .select('id, school_id, name, class')
        .eq('name', name)
        .eq('role', role)

      if (contact) query = query.eq('contact', contact)
      if (dob) query = query.eq('dob', dob)

      const { data: users, error: usersErr } = await query
      if (usersErr) {
        console.error('recover-school-code users query error:', usersErr)
        return errorResponse('Server error during identity lookup. Please try again.')
      }
      if (!users || users.length === 0) {
        return errorResponse('We could not verify your identity. Please contact your school administration.')
      }

      const user = users[0] as { id: string; school_id: string; name: string; class: string }

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

        const { data: attendance } = await supabaseAdmin
          .from('attendance').select('attendance_data').eq('user_id', userProfile.id).limit(1).maybeSingle()
        if (attendance) {
          const ad = attendance as { attendance_data?: Record<string, string> }
          const keys = ad.attendance_data ? Object.keys(ad.attendance_data) : []
          if (keys.length > 0) {
            const checkDate = keys[0]
            const realStatus = ad.attendance_data![checkDate]
            questionsList.push({ id: qIndex, question: `What was your attendance status on ${checkDate}?`, options: ['Present', 'Absent', 'On Leave'].sort(() => Math.random() - 0.5) })
            answersMap[qIndex] = realStatus
            qIndex++
          }
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

      // Fill generic questions to reach 5
      const genericQs = [
        "What is the first name of your school's current principal?",
        "Which state is your school located in?",
        "What is the name of your school mascot?"
      ]
      let genIdx = 0
      while (questionsList.length < 5) {
        const qText = genericQs[genIdx] || `Verification Question ${qIndex}`
        questionsList.push({ id: qIndex, question: qText, options: [] })
        if (genIdx === 0) {
          const { data: principal } = await supabaseAdmin
            .from('users').select('name').eq('school_id', userProfile.school_id).eq('role', 'admin').limit(1).maybeSingle()
          answersMap[qIndex] = (principal as { name?: string } | null)?.name ?? 'Principal'
        } else {
          answersMap[qIndex] = 'SchoolOS+'
        }
        genIdx++
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
    // 5. QR CODE DEVICE SYNC
    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'qr-generate') {
      const qrToken = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

      // NOTE: user_id is NULL here because no user has scanned yet.
      // The v76 migration makes user_id nullable in this table.
      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .insert({
          user_id: null,        // Intentionally null — no user yet
          school_id: null,      // Intentionally null — no user yet
          qr_token: qrToken,
          qr_verified: false,
          expires_at: expiresAt
        })
        .select()
        .single()

      if (error) {
        console.error('qr-generate insert error:', error)
        return errorResponse(`Failed to generate QR session: ${error.message}`)
      }

      return jsonResponse({ qrToken, sessionId: (session as { id: string }).id })
    }

    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'qr-poll') {
      const qrToken = payload.qrToken as string | undefined
      if (!qrToken) return errorResponse('Missing QR token')

      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('qr_token', qrToken)
        .maybeSingle()

      if (error || !session) {
        return jsonResponse({ expired: true })
      }

      const s = session as { qr_verified: boolean; user_id: string | null; expires_at: string }

      // Check expiry
      if (s.expires_at && new Date(s.expires_at) < new Date()) {
        await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('qr_token', qrToken)
        return jsonResponse({ expired: true })
      }

      if (s.qr_verified && s.user_id) {
        // Generate magic link for the verified user
        const { data: userRow, error: userErr } = await supabaseAdmin
          .from('users').select('email').eq('id', s.user_id).maybeSingle()

        if (userErr || !userRow) return errorResponse('User email not found')

        const emailToUse = (userRow as { email?: string }).email || `${s.user_id}@school.com`

        const { data: otpLink, error: otpErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: emailToUse
        })

        if (otpErr) {
          console.error('Magic link generation error:', otpErr)
          return errorResponse('Failed to generate login link. Please try again.')
        }

        await supabaseAdmin.from('recovery_ephemeral_sessions').delete().eq('qr_token', qrToken)

        return jsonResponse({ verified: true, loginUrl: otpLink.properties.action_link })
      }

      return jsonResponse({ verified: false })
    }

    // ─────────────────────────────────────────────────────────────────────────

    if (action === 'qr-approve') {
      const qrToken = payload.qrToken as string | undefined
      const mobileUserId = payload.mobileUserId as string | undefined
      if (!qrToken || !mobileUserId) return errorResponse('Missing approval credentials')

      const { data: session } = await supabaseAdmin
        .from('recovery_ephemeral_sessions').select('*').eq('qr_token', qrToken).maybeSingle()

      if (!session) return errorResponse('Session expired or invalid')

      const { data: userProfile, error: userProfileErr } = await supabaseAdmin
        .from('users').select('school_id').eq('id', mobileUserId).maybeSingle()

      if (userProfileErr || !userProfile) return errorResponse('Mobile user profile not found')

      await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .update({ qr_verified: true, user_id: mobileUserId, school_id: (userProfile as { school_id: string }).school_id })
        .eq('qr_token', qrToken)

      return jsonResponse({ success: true })
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. RECOVERY LOCKING ("It's Not Me")
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
