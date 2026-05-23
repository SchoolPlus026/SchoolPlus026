import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    let body: any = {}
    try {
      body = await req.json()
    } catch (_) {
      throw new Error('Invalid JSON payload')
    }
    const { action, ...payload } = body
    if (!action) throw new Error('Missing action parameter')

    // ─────────────────────────────────────────────────────────────────────────
    // 1. STANDARD LOGIN BRUTE-FORCE PROTECTION
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'check-brute-force') {
      const { username } = payload
      if (!username) throw new Error('Username is required')

      const { data: log, error } = await supabaseAdmin
        .from('login_brute_force_logs')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .maybeSingle()

      if (error) throw error

      if (log && log.locked_until && new Date(log.locked_until) > new Date()) {
        return new Response(
          JSON.stringify({ locked: true, lockedUntil: log.locked_until }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      return new Response(
        JSON.stringify({ locked: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (action === 'log-failure') {
      const { username } = payload
      if (!username) throw new Error('Username is required')

      const trimmedUsername = username.trim().toLowerCase()

      const { data: log } = await supabaseAdmin
        .from('login_brute_force_logs')
        .select('*')
        .eq('username', trimmedUsername)
        .maybeSingle()

      let attempts = 1
      let lockedUntil = null

      if (log) {
        attempts = log.failed_attempts + 1
        if (attempts >= 5) {
          lockedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours lockout
        }

        await supabaseAdmin
          .from('login_brute_force_logs')
          .update({
            failed_attempts: attempts,
            locked_until: lockedUntil,
            last_attempt_at: new Date().toISOString()
          })
          .eq('username', trimmedUsername)
      } else {
        await supabaseAdmin
          .from('login_brute_force_logs')
          .insert({
            username: trimmedUsername,
            failed_attempts: 1
          })
      }

      return new Response(
        JSON.stringify({ attempts, locked: attempts >= 5, lockedUntil }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (action === 'reset-failures') {
      const { username } = payload
      if (!username) throw new Error('Username is required')

      await supabaseAdmin
        .from('login_brute_force_logs')
        .delete()
        .eq('username', username.trim().toLowerCase())

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. PRIVATE SCHOOL CODE RETRIEVAL
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'recover-school-code') {
      const { name, role, contact, dob } = payload
      if (!name || !role) throw new Error('Missing identity details')
      if ((!contact || !contact.trim()) && !dob) {
        throw new Error('Please enter either your Registered Contact Number or Date of Birth.')
      }

      let query = supabaseAdmin
        .from('users')
        .select('id, school_id, name, class')
        .eq('name', name.trim())
        .eq('role', role)

      if (contact && contact.trim()) {
        query = query.eq('contact', contact.trim())
      }
      if (dob) {
        query = query.eq('dob', dob)
      }

      const { data: users, error } = await query
      if (!users || users.length === 0) {
        throw new Error('We could not verify your identity. Please contact your school administration.')
      }

      // Pick the first matched user
      const user = users[0]

      // Generate a dynamic verification challenge based on role
      let challengeQuestion = ''
      let options: string[] = []
      let correctAnswer = ''

      if (role === 'student') {
        challengeQuestion = 'Select your Class Teacher from the list below:'
        const { data: teachers } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('school_id', user.school_id)
          .eq('role', 'teacher')
          .eq('class', user.class)
          .limit(1)

        const { data: randomTeachers } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('school_id', user.school_id)
          .eq('role', 'teacher')
          .neq('class', user.class)
          .limit(2)

        correctAnswer = teachers?.[0]?.name ?? 'Principal'
        options = [correctAnswer]
        if (randomTeachers) {
          randomTeachers.forEach(t => options.push(t.name))
        }
        while (options.length < 3) {
          options.push(`Teacher ${options.length + 1}`)
        }
        options.sort(() => Math.random() - 0.5)
      } else if (role === 'teacher') {
        challengeQuestion = 'Select one of YOUR students from the list below:'
        const { data: students } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('school_id', user.school_id)
          .eq('role', 'student')
          .eq('class', user.class)
          .limit(1)

        const { data: randomStudents } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('school_id', user.school_id)
          .eq('role', 'student')
          .neq('class', user.class)
          .limit(2)

        correctAnswer = students?.[0]?.name ?? 'Class Monitor'
        options = [correctAnswer]
        if (randomStudents) {
          randomStudents.forEach(s => options.push(s.name))
        }
        while (options.length < 3) {
          options.push(`Student ${options.length + 1}`)
        }
        options.sort(() => Math.random() - 0.5)
      } else {
        challengeQuestion = 'Select the School Admin/Principal from the list below:'
        const { data: admins } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('school_id', user.school_id)
          .eq('role', 'admin')
          .limit(1)

        const { data: randomStaff } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('school_id', user.school_id)
          .neq('role', 'admin')
          .limit(2)

        correctAnswer = admins?.[0]?.name ?? 'System Admin'
        options = [correctAnswer]
        if (randomStaff) {
          randomStaff.forEach(s => options.push(s.name))
        }
        while (options.length < 3) {
          options.push(`Staff ${options.length + 1}`)
        }
        options.sort(() => Math.random() - 0.5)
      }

      // Store challenge answers in ephemeral sessions
      const { data: session, error: sessErr } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .insert({
          user_id: user.id,
          school_id: user.school_id,
          saved_answers: { correctAnswer, step: 'school-code' }
        })
        .select()
        .single()

      if (sessErr) throw sessErr

      return new Response(
        JSON.stringify({ challengeQuestion, options, sessionId: session.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (action === 'verify-school-code') {
      const { sessionId, answer } = payload
      if (!sessionId || !answer) throw new Error('Missing session details')

      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()

      if (error || !session) throw new Error('Session expired or invalid')

      const saved = session.saved_answers
      if (saved?.step !== 'school-code' || saved?.correctAnswer !== answer) {
        throw new Error('Verification failed. Incorrect answer.')
      }

      // Fetch School Code
      const { data: school, error: schoolErr } = await supabaseAdmin
        .from('school_settings')
        .select('school_code')
        .eq('school_id', session.school_id)
        .maybeSingle()

      if (schoolErr || !school) throw new Error('School settings not found')

      // Delete ephemeral session
      await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .delete()
        .eq('id', sessionId)

      return new Response(
        JSON.stringify({ schoolCode: school.school_code }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. COMPILE 5 DYNAMIC QUESTIONS & INITIATE RECOVERY (PASSWORD OR USERNAME)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'initiate-recovery') {
      const { credential_type, username, password, school_code, name, dob, contact } = payload

      let userProfile = null

      if (credential_type === 'password') {
        // Recovering Password requires Username + 5 Questions
        if (!username || !school_code) throw new Error('Missing Username or School Code')

        const { data: school, error: schoolErr } = await supabaseAdmin
          .from('school_settings')
          .select('school_id')
          .eq('school_code', school_code.toUpperCase())
          .maybeSingle()

        if (schoolErr || !school) throw new Error('Invalid School Code')

        const { data: uProf } = await supabaseAdmin
          .from('users')
          .select('*')
          .eq('username', username.trim())
          .eq('school_id', school.school_id)
          .maybeSingle()

        if (!uProf) throw new Error('Account not found')
        userProfile = uProf
      } else {
        // Recovering Username requires Password + 5 Questions
        if (!password || !school_code || !name) {
          throw new Error('Missing password or identity matching fields')
        }
        if ((!contact || !contact.trim()) && !dob) {
          throw new Error('Please enter either your Registered Contact Number or Date of Birth.')
        }

        const { data: school, error: schoolErr } = await supabaseAdmin
          .from('school_settings')
          .select('school_id')
          .eq('school_code', school_code.toUpperCase())
          .maybeSingle()

        if (schoolErr || !school) throw new Error('Invalid School Code')

        // First find user matching details in public.users
        let query = supabaseAdmin
          .from('users')
          .select('*')
          .eq('name', name.trim())
          .eq('school_id', school.school_id)

        if (dob) {
          query = query.eq('dob', dob)
        }
        if (contact && contact.trim()) {
          query = query.eq('contact', contact.trim())
        }

        const { data: usersMatching } = await query

        if (!usersMatching || usersMatching.length === 0) {
          throw new Error('We could not verify your identity. Please contact school office.')
        }

        const userCandidate = usersMatching[0]

        // Verify password
        const loginEmail = userCandidate.email || `${userCandidate.username}@school.com`
        const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
          email: loginEmail,
          password: password
        })

        if (authErr || !authData.user) {
          throw new Error('Incorrect password or credentials match failure.')
        }

        userProfile = userCandidate
      }

      // Check if account recovery is locked out permanently
      const { data: recProfile } = await supabaseAdmin
        .from('recovery_profiles')
        .select('*')
        .eq('user_id', userProfile.id)
        .maybeSingle()

      if (recProfile && recProfile.recovery_locked_until && new Date(recProfile.recovery_locked_until) > new Date()) {
        const unlockTime = new Date(recProfile.recovery_locked_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        throw new Error(`🔒 Account Recovery Locked: Recovery functions are frozen on this account for 24 hours. Please try again after ${unlockTime}.`);
      }

      // Generate exactly 5 questions
      const questionsList: Array<{ id: number; question: string; options: string[] }> = []
      const answersMap: Record<number, string> = {}
      let qIndex = 1

      // Q1: DOB Check (Compulsory if present)
      if (userProfile.dob) {
        questionsList.push({
          id: qIndex,
          question: 'Please verify your Date of Birth:',
          options: [
            new Date(userProfile.dob).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            new Date(Date.now() - 5 * 365 * 24 * 3600000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            new Date(Date.now() - 15 * 365 * 24 * 3600000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          ].sort(() => Math.random() - 0.5)
        })
        answersMap[qIndex] = new Date(userProfile.dob).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        qIndex++
      }

      // Q2: Registered Contact Check (Compulsory if present)
      if (userProfile.contact) {
        const cleanContact = userProfile.contact.trim()
        questionsList.push({
          id: qIndex,
          question: 'Verify the last 4 digits of your registered contact number:',
          options: [cleanContact.slice(-4), '1048', '9827'].sort(() => Math.random() - 0.5)
        })
        answersMap[qIndex] = cleanContact.slice(-4)
        qIndex++
      }

      // Role-based Contextual Questions (Q3, Q4)
      if (userProfile.role === 'student') {
        const { data: teacher } = await supabaseAdmin
          .from('users')
          .select('name')
          .eq('school_id', userProfile.school_id)
          .eq('role', 'teacher')
          .eq('class', userProfile.class)
          .limit(1)
          .maybeSingle()

        if (teacher) {
          questionsList.push({
            id: qIndex,
            question: 'Who is your Class Teacher?',
            options: [teacher.name, 'Mr. Sharma (Math)', 'Mrs. Gupta (Hindi)'].sort(() => Math.random() - 0.5)
          })
          answersMap[qIndex] = teacher.name
          qIndex++
        }

        const { data: attendance } = await supabaseAdmin
          .from('attendance')
          .select('attendance_data')
          .eq('user_id', userProfile.id)
          .limit(1)
          .maybeSingle()

        if (attendance && attendance.attendance_data) {
          const keys = Object.keys(attendance.attendance_data)
          if (keys.length > 0) {
            const checkDate = keys[0]
            const realStatus = attendance.attendance_data[checkDate]
            questionsList.push({
              id: qIndex,
              question: `What was your attendance status on ${checkDate}?`,
              options: ['Present', 'Absent', 'On Leave'].sort(() => Math.random() - 0.5)
            })
            answersMap[qIndex] = realStatus
            qIndex++
          }
        }
      } else if (userProfile.role === 'teacher') {
        const { data: tt } = await supabaseAdmin
          .from('timetable')
          .select('*')
          .eq('teacher', userProfile.id.toString())
          .limit(1)
          .maybeSingle()

        if (tt) {
          questionsList.push({
            id: qIndex,
            question: `According to the school timetable, which class do you teach during period ${tt.period_order} on ${tt.day}?`,
            options: [tt.class, '5th A', '9th C'].sort(() => Math.random() - 0.5)
          })
          answersMap[qIndex] = tt.class
          qIndex++
        }

        const { data: leave } = await supabaseAdmin
          .from('leaves')
          .select('from_date')
          .eq('user_id', userProfile.id)
          .limit(1)
          .maybeSingle()

        if (leave) {
          questionsList.push({
            id: qIndex,
            question: 'Select the start date of your last applied leave application:',
            options: [leave.from_date, '2026-01-15', '2026-04-10'].sort(() => Math.random() - 0.5)
          })
          answersMap[qIndex] = leave.from_date
          qIndex++
        }
      } else if (userProfile.role === 'driver') {
        const { data: bus } = await supabaseAdmin
          .from('bus_assignments')
          .select('bus_number, route_name')
          .eq('driver_id', userProfile.id)
          .limit(1)
          .maybeSingle()

        if (bus) {
          questionsList.push({
            id: qIndex,
            question: 'What is your assigned School Bus Number?',
            options: [bus.bus_number, 'Bus-08', 'Bus-12'].sort(() => Math.random() - 0.5)
          })
          answersMap[qIndex] = bus.bus_number
          qIndex++
        }
      }

      if (questionsList.length < 5 && recProfile) {
        if (recProfile.security_question_1 && recProfile.security_answer_1_hash) {
          questionsList.push({
            id: qIndex,
            question: recProfile.security_question_1,
            options: []
          })
          answersMap[qIndex] = recProfile.security_answer_1_hash
          qIndex++
        }
        if (recProfile.security_question_2 && recProfile.security_answer_2_hash) {
          questionsList.push({
            id: qIndex,
            question: recProfile.security_question_2,
            options: []
          })
          answersMap[qIndex] = recProfile.security_answer_2_hash
          qIndex++
        }
      }

      const genericQuestions = [
        "What is the first name of your school's current principal?",
        "Which state is your school located in?",
        "What is the name of your school mascot?"
      ]
      let genIndex = 0
      while (questionsList.length < 5) {
        questionsList.push({
          id: qIndex,
          question: genericQuestions[genIndex] || `Static Verification Question ${qIndex}`,
          options: []
        })
        if (genIndex === 0) {
          const { data: principal } = await supabaseAdmin
            .from('users')
            .select('name')
            .eq('school_id', userProfile.school_id)
            .eq('role', 'admin')
            .limit(1)
            .maybeSingle()
          answersMap[qIndex] = principal?.name ?? 'Principal'
        } else {
          answersMap[qIndex] = 'SchoolOS+'
        }
        genIndex++
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

      if (sessErr) throw sessErr

      return new Response(
        JSON.stringify({ questions: finalQuestions, sessionId: session.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. SUBMIT AND EVALUATE RECOVERY ANSWERS (DELAYED EVALUATION + 2 ATTEMPTS)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'submit-recovery-answers') {
      const { sessionId, answers, newPassword } = payload
      if (!sessionId || !answers) throw new Error('Missing session details')

      await supabaseAdmin.rpc('cleanup_expired_recovery_sessions')

      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()

      if (error || !session) throw new Error('Recovery session has expired or is invalid. Please restart.')

      // Check lockout status
      const { data: recProfile } = await supabaseAdmin
        .from('recovery_profiles')
        .select('*')
        .eq('user_id', session.user_id)
        .maybeSingle()

      if (recProfile && recProfile.recovery_locked_until && new Date(recProfile.recovery_locked_until) > new Date()) {
        throw new Error(`This recovery session is locked. Try again after 24 hours.`)
      }

      const { answersMap, credential_type } = session.saved_answers
      const incorrectQuestions: number[] = []

      for (const [idStr, realAns] of Object.entries(answersMap)) {
        const qId = parseInt(idStr)
        const userAns = (answers[qId] ?? '').trim().toLowerCase()

        if (userAns !== realAns.trim().toLowerCase()) {
          incorrectQuestions.push(qId)
        }
      }

      if (incorrectQuestions.length > 0) {
        const newAttempts = session.attempt_count + 1
        let lockedUntil = null

        if (newAttempts >= 2) {
          lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours lockout
          
          // Lock recovery permanently on user profile
          if (recProfile) {
            await supabaseAdmin
              .from('recovery_profiles')
              .update({ recovery_locked_until: lockedUntil })
              .eq('user_id', session.user_id)
          } else {
            await supabaseAdmin
              .from('recovery_profiles')
              .insert({ user_id: session.user_id, school_id: session.school_id, recovery_locked_until: lockedUntil })
          }
        }

        const { data: uProfile, error: uProfileErr } = await supabaseAdmin
          .from('users')
          .select('role')
          .eq('id', session.user_id)
          .maybeSingle()

        if (uProfileErr || !uProfile) throw new Error('User profile not found')

        if (uProfile?.role === 'student') {
          return new Response(
            JSON.stringify({
              error: 'Verification aborted.',
              abort: true,
              message: 'Please contact your Class Teacher to reset your password.'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify({
            error: 'Validation failed. Some answers were incorrect.',
            incorrectQuestions,
            attempts: newAttempts,
            locked: newAttempts >= 2,
            lockedUntil
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // SUCCESS!
      if (credential_type === 'password') {
        if (!newPassword) throw new Error('New password is required to complete recovery')
        if (newPassword.length < 6) throw new Error('Password must be at least 6 characters long')

        const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(
          session.user_id,
          { password: newPassword }
        )

        if (resetErr) throw resetErr

        await supabaseAdmin
          .from('recovery_ephemeral_sessions')
          .delete()
          .eq('id', sessionId)

        // Queue alert in notifications for dashboard
        await supabaseAdmin
          .from('notifications')
          .insert({
            school_id: session.school_id,
            to_user_id: session.user_id,
            message: 'Your account password was recently reset. If this was not you, lock recovery options immediately.',
            link: '/settings'
          })

        return new Response(
          JSON.stringify({ success: true, message: 'Password updated successfully!' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      } else {
        // Recovering Username
        const { data: uProfile, error: uProfileErr } = await supabaseAdmin
          .from('users')
          .select('username')
          .eq('id', session.user_id)
          .maybeSingle()

        if (uProfileErr || !uProfile) throw new Error('User profile not found')

        await supabaseAdmin
          .from('recovery_ephemeral_sessions')
          .delete()
          .eq('id', sessionId)

        return new Response(
          JSON.stringify({ success: true, username: uProfile.username }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. UNIVERSAL QR CODE DEVICE HANDSHAKE
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'qr-generate') {
      const qrToken = crypto.randomUUID()

      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          qr_token: qrToken,
          qr_verified: false,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        })
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify({ qrToken, sessionId: session.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (action === 'qr-poll') {
      const { qrToken } = payload
      if (!qrToken) throw new Error('Missing QR token')

      const { data: session, error } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('qr_token', qrToken)
        .maybeSingle()

      if (error || !session) {
        return new Response(
          JSON.stringify({ expired: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      if (session.qr_verified && session.user_id !== '00000000-0000-0000-0000-000000000000') {
        const { data: user, error: userErr } = await supabaseAdmin
          .from('users')
          .select('email')
          .eq('id', session.user_id)
          .maybeSingle()

        if (userErr || !user) throw new Error('User email not found')

        const { data: otpLink, error: otpErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: user.email || `${session.user_id}@school.com`
        })

        if (otpErr) throw otpErr

        await supabaseAdmin
          .from('recovery_ephemeral_sessions')
          .delete()
          .eq('qr_token', qrToken)

        return new Response(
          JSON.stringify({ verified: true, loginUrl: otpLink.properties.action_link }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      return new Response(
        JSON.stringify({ verified: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (action === 'qr-approve') {
      const { qrToken, mobileUserId } = payload
      if (!qrToken || !mobileUserId) throw new Error('Missing approval credentials')

      const { data: session } = await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .select('*')
        .eq('qr_token', qrToken)
        .maybeSingle()

      if (!session) throw new Error('Session expired or invalid')

      const { data: userProfile, error: userProfileErr } = await supabaseAdmin
        .from('users')
        .select('school_id')
        .eq('id', mobileUserId)
        .maybeSingle()

      if (userProfileErr || !userProfile) throw new Error('Mobile user profile not found')

      await supabaseAdmin
        .from('recovery_ephemeral_sessions')
        .update({
          qr_verified: true,
          user_id: mobileUserId,
          school_id: userProfile.school_id
        })
        .eq('qr_token', qrToken)

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. IT'S NOT ME (RECOVERY LOCKING)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'lock-recovery') {
      const { userId } = payload
      if (!userId) throw new Error('Missing user parameter')

      const lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours lock

      const { data: recProfile } = await supabaseAdmin
        .from('recovery_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (recProfile) {
        await supabaseAdmin
          .from('recovery_profiles')
          .update({ recovery_locked_until: lockedUntil })
          .eq('user_id', userId)
      } else {
        const { data: userProfile, error: userProfileErr } = await supabaseAdmin
          .from('users')
          .select('school_id')
          .eq('id', userId)
          .maybeSingle()

        if (userProfileErr || !userProfile) throw new Error('User profile not found')

        await supabaseAdmin
          .from('recovery_profiles')
          .insert({
            user_id: userId,
            school_id: userProfile?.school_id,
            recovery_locked_until: lockedUntil
          })
      }

      return new Response(
        JSON.stringify({ success: true, lockedUntil }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    throw new Error(`Unsupported action: ${action}`)

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
