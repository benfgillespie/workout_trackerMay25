'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function WorkoutTracker() {
  // Authentication state
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Core state variables
  const [exercises, setExercises] = useState([])
  const [userWeights, setUserWeights] = useState({})
  const [currentWorkout, setCurrentWorkout] = useState(null)
  const [workoutSets, setWorkoutSets] = useState([])
  const [currentCycle, setCurrentCycle] = useState({ week: 1, day: 'Light', cycle: 1 })
  const [recentWorkouts, setRecentWorkouts] = useState([])
  
  // UI state variables
  const [showWeightManager, setShowWeightManager] = useState(false)
  const [showAllWorkouts, setShowAllWorkouts] = useState(false)
  const [allWorkouts, setAllWorkouts] = useState([])
  const [selectedWorkout, setSelectedWorkout] = useState(null)
  const [workoutDetails, setWorkoutDetails] = useState([])
  const [editingSet, setEditingSet] = useState(null)
  const [editWeight, setEditWeight] = useState(0)
  const [editReps, setEditReps] = useState(0)
  const [showingCustomDialog, setShowingCustomDialog] = useState(false)
  const [customExerciseId, setCustomExerciseId] = useState(null)
  const [customWeight, setCustomWeight] = useState(0)
  const [customReps, setCustomReps] = useState(0)
  const [isEditingCompletedWorkout, setIsEditingCompletedWorkout] = useState(false)
  
  // Cardio state variables
  const [showCardioDialog, setShowCardioDialog] = useState(false)
  const [cardioType, setCardioType] = useState('')
  const [cardioDuration, setCardioDuration] = useState(0)
  const [cardioIs4x4, setCardioIs4x4] = useState(false)
  const [recentCardio, setRecentCardio] = useState([])
  const [next4x4Date, setNext4x4Date] = useState(null)
  const [missed4x4Count, setMissed4x4Count] = useState(0)
  const [zone2Minutes, setZone2Minutes] = useState(0)

  // Authentication and initialization
  useEffect(() => {
    checkUser()
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user)
          await loadData(session.user)
        } else {
          setUser(null)
          clearUserData()
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        await loadData(session.user)
      }
    } catch (error) {
      console.error('Error checking user:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearUserData = () => {
    setExercises([])
    setUserWeights({})
    setCurrentWorkout(null)
    setWorkoutSets([])
    setRecentWorkouts([])
    setRecentCardio([])
  }

  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      
      if (data?.url) {
        window.location.href = data.url
      }
      
      if (error) throw error
    } catch (error) {
      console.error('Error signing in with Google:', error)
      alert('Failed to sign in with Google: ' + error.message)
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

// Data loading functions
  const loadData = async (currentUser) => {
    if (!currentUser) return
    
    try {
      // Load exercises first
      const { data: exercisesData, error: exercisesError } = await supabase
        .from('exercises')
        .select('*')
        .order('name')

      if (exercisesError) {
        console.error('Error loading exercises:', exercisesError)
        return
      }

      // If no exercises exist, create default ones
      if (!exercisesData || exercisesData.length === 0) {
        await createDefaultExercises()
        return loadData(currentUser) // Reload after creating exercises
      }

      // Load user weights
      const { data: weightsData, error: weightsError } = await supabase
        .from('user_exercise_weights')
        .select('exercise_id, prescribed_weight')
        .eq('user_id', currentUser.id)

      if (weightsError) {
        console.error('Error loading weights:', weightsError)
      }

      // Create default weights for new users
      if (!weightsData || weightsData.length === 0) {
        await createDefaultWeights(currentUser.id, exercisesData)
        return loadData(currentUser) // Reload after creating weights
      }

      // Load workout session data
      const { data: lastSession } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(1)

      const { data: recentWorkoutsData } = await supabase
        .from('workout_sessions')
        .select(`
          *,
          workout_sets (
            id,
            exercise_id,
            actual_weight,
            actual_reps,
            status,
            exercises (name)
          )
        `)
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(3)

      // Set state
      setExercises(exercisesData)
      
      const weightsMap = {}
      weightsData?.forEach(w => {
        weightsMap[w.exercise_id] = w.prescribed_weight
      })
      setUserWeights(weightsMap)

      // Calculate next cycle
      if (lastSession && lastSession.length > 0) {
        const last = lastSession[0]
        let nextWeek = last.week_number
        let nextDay = getNextDay(last.day_type)
        let nextCycle = last.cycle_number

        if (nextDay === 'Light' && last.day_type === 'Heavy') {
          nextWeek += 1
          if (nextWeek > 5) {
            nextWeek = 1
            nextCycle += 1
          }
        }

        setCurrentCycle({
          week: nextWeek,
          day: nextDay,
          cycle: nextCycle
        })
      }

      setRecentWorkouts(recentWorkoutsData || [])
      await loadCardioData(currentUser)
      
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const createDefaultExercises = async () => {
    const defaultExercises = [
      { name: 'Squat', category: 'Legs' },
      { name: 'Bench Press', category: 'Chest' },
      { name: 'Bent-Over Row', category: 'Back' },
      { name: 'Overhead Press', category: 'Shoulders' },
      { name: 'Deadlift', category: 'Back' }
    ]

    try {
      const { error } = await supabase
        .from('exercises')
        .insert(defaultExercises)

      if (error) throw error
    } catch (error) {
      console.error('Error creating default exercises:', error)
    }
  }

  const createDefaultWeights = async (userId, exercises) => {
    const defaultWeights = exercises.map(exercise => ({
      user_id: userId,
      exercise_id: exercise.id,
      prescribed_weight: 20 // Default starting weight
    }))

    try {
      const { error } = await supabase
        .from('user_exercise_weights')
        .insert(defaultWeights)

      if (error) throw error
    } catch (error) {
      console.error('Error creating default weights:', error)
    }
  }

  const loadCardioData = async (currentUser) => {
    if (!currentUser) return
    
    try {
      const { data: cardioData } = await supabase
        .from('cardio_sessions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('workout_date', { ascending: false })
        .limit(5)

      setRecentCardio(cardioData || [])

      // Calculate 4x4 tracking
      const today = new Date()
      const currentSunday = getNextSunday(today)
      
      const { data: last4x4 } = await supabase
        .from('cardio_sessions')
        .select('workout_date')
        .eq('user_id', currentUser.id)
        .eq('is_4x4', true)
        .order('workout_date', { ascending: false })
        .limit(1)

      let nextDueDate = currentSunday
      if (last4x4 && last4x4.length > 0) {
        const lastDate = new Date(last4x4[0].workout_date)
        const lastSunday = getNextSunday(lastDate)
        nextDueDate = new Date(lastSunday)
        nextDueDate.setDate(nextDueDate.getDate() + 7)
      }

      setNext4x4Date(nextDueDate)

      // Calculate missed 4x4 sessions
      const twelveWeeksAgo = new Date()
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - (12 * 7))
      
      const { data: recent4x4s } = await supabase
        .from('cardio_sessions')
        .select('workout_date')
        .eq('user_id', currentUser.id)
        .eq('is_4x4', true)
        .gte('workout_date', twelveWeeksAgo.toISOString().split('T')[0])

      const completedWeeks = new Set()
      recent4x4s?.forEach(session => {
        const date = new Date(session.workout_date)
        const weekStart = getWeekStart(date)
        completedWeeks.add(weekStart.toISOString().split('T')[0])
      })

      const missedCount = 12 - completedWeeks.size
      setMissed4x4Count(Math.max(0, missedCount))

      // Calculate Zone 2 minutes
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const { data: recentCardioForZone2 } = await supabase
        .from('cardio_sessions')
        .select('duration_minutes, is_4x4')
        .eq('user_id', currentUser.id)
        .gte('workout_date', sevenDaysAgo.toISOString().split('T')[0])

      const totalZone2Minutes = recentCardioForZone2?.reduce((sum, session) => {
        return session.is_4x4 ? sum : sum + session.duration_minutes
      }, 0) || 0
      
      setZone2Minutes(totalZone2Minutes)

    } catch (error) {
      console.error('Error loading cardio data:', error)
    }
  }

// Utility functions
  const getNextSunday = (date) => {
    const result = new Date(date)
    result.setDate(result.getDate() + (7 - result.getDay()) % 7)
    return result
  }

  const getWeekStart = (date) => {
    const result = new Date(date)
    result.setDate(result.getDate() - result.getDay())
    return result
  }

  const getNextDay = (currentDay) => {
    const dayOrder = ['Light', 'Medium', 'Heavy']
    const currentIndex = dayOrder.indexOf(currentDay)
    return dayOrder[(currentIndex + 1) % dayOrder.length]
  }

  const calculateWorkoutWeight = (prescribedWeight, dayType) => {
    const multipliers = { Light: 0.8, Medium: 0.9, Heavy: 1.0 }
    return Math.round(prescribedWeight * multipliers[dayType] * 4) / 4
  }

  const getRepsForWeek = (week) => {
    return 6 + week + 1
  }

  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }

  const formatDateString = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }

  const getWorkoutSummary = (workout) => {
    if (!workout.workout_sets) return 'No sets logged'
    
    const completedSets = workout.workout_sets.filter(s => s.status === 'Complete' || s.status === 'Exceeded')
    const totalSets = workout.workout_sets.length
    
    return `${completedSets.length}/${totalSets} sets completed`
  }

  const isLevelUpEligible = (exerciseId, sets = workoutSets) => {
    if (currentCycle.week !== 5 || currentCycle.day !== 'Heavy') {
      return false
    }
    
    const exerciseSets = sets.filter(s => s.exercise_id === exerciseId && s.logged)
    const completedSets = exerciseSets.filter(s => s.status === 'Complete' || s.status === 'Exceeded')
    
    return completedSets.length >= 2
  }

  const getWeeklyWorkoutCount = () => {
    const today = new Date()
    const startOfWeek = new Date(today)
    const dayOfWeek = today.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startOfWeek.setDate(today.getDate() - daysFromMonday)
    
    return recentWorkouts.filter(workout => {
      const workoutDate = new Date(workout.workout_date)
      return workoutDate >= startOfWeek
    }).length
  }

  // Workout functions
  const startWorkout = async () => {
    try {
      const { data: session, error } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: user.id,
          workout_date: new Date().toISOString().split('T')[0],
          week_number: currentCycle.week,
          day_type: currentCycle.day,
          cycle_number: currentCycle.cycle
        })
        .select()
        .single()

      if (error) throw error

      setCurrentWorkout(session)
      setIsEditingCompletedWorkout(false)

      const sets = []
      exercises.forEach(exercise => {
        const prescribedWeight = userWeights[exercise.id] || 0
        const workoutWeight = calculateWorkoutWeight(prescribedWeight, currentCycle.day)
        const reps = getRepsForWeek(currentCycle.week)

        for (let i = 1; i <= 2; i++) {
          sets.push({
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            prescribed_weight: workoutWeight,
            prescribed_reps: reps,
            set_number: i,
            status: 'Incomplete',
            session_id: session.id
          })
        }
      })

      setWorkoutSets(sets)
    } catch (error) {
      console.error('Error starting workout:', error)
    }
  }

  const logSet = async (setIndex, actualWeight, actualReps) => {
    const set = workoutSets[setIndex]
    let status = 'Incomplete'

    if (actualReps >= set.prescribed_reps && actualWeight >= set.prescribed_weight) {
      status = actualReps > set.prescribed_reps || actualWeight > set.prescribed_weight ? 'Exceeded' : 'Complete'
    }

    try {
      let setId
      
      if (set.set_id) {
        await supabase
          .from('workout_sets')
          .update({
            prescribed_weight: set.prescribed_weight,
            actual_weight: actualWeight,
            prescribed_reps: set.prescribed_reps,
            actual_reps: actualReps,
            status: status
          })
          .eq('id', set.set_id)
        
        setId = set.set_id
      } else {
        const { data: newSet } = await supabase
          .from('workout_sets')
          .insert({
            user_id: user.id,
            session_id: set.session_id,
            exercise_id: set.exercise_id,
            prescribed_weight: set.prescribed_weight,
            actual_weight: actualWeight,
            prescribed_reps: set.prescribed_reps,
            actual_reps: actualReps,
            set_number: set.set_number,
            status: status
          })
          .select()
          .single()
        
        setId = newSet.id
      }

      const updatedSets = [...workoutSets]
      updatedSets[setIndex] = {
        ...set,
        actual_weight: actualWeight,
        actual_reps: actualReps,
        status: status,
        logged: true,
        set_id: setId
      }
      setWorkoutSets(updatedSets)

      if (currentCycle.week === 5 && currentCycle.day === 'Heavy') {
        checkForLevelUp(set.exercise_id, updatedSets)
      }

    } catch (error) {
      console.error('Error logging set:', error)
    }
  }

  const checkForLevelUp = async (exerciseId, sets) => {
    const exerciseSets = sets.filter(s => s.exercise_id === exerciseId && s.logged)
    const completedSets = exerciseSets.filter(s => s.status === 'Complete' || s.status === 'Exceeded')

    if (completedSets.length >= 2) {
      const currentWeight = userWeights[exerciseId]
      const newWeight = Math.round(currentWeight * 1.1 * 4) / 4

      try {
        await supabase
          .from('user_exercise_weights')
          .update({ prescribed_weight: newWeight, updated_at: new Date().toISOString() })
          .eq('exercise_id', exerciseId)
          .eq('user_id', user.id)

        setUserWeights(prev => ({
          ...prev,
          [exerciseId]: newWeight
        }))

        const exerciseName = exercises.find(e => e.id === exerciseId)?.name
        alert(`🎉 LEVEL UP! ${exerciseName} increased to ${newWeight}kg`)
      } catch (error) {
        console.error('Error updating weight:', error)
      }
    }
  }

  const finishWorkout = () => {
    setCurrentWorkout(null)
    setWorkoutSets([])
    setIsEditingCompletedWorkout(false)
    loadData(user)
  }

  const exitWorkout = () => {
    if (isEditingCompletedWorkout) {
      if (confirm('Discard changes and return to workout history?')) {
        setCurrentWorkout(null)
        setWorkoutSets([])
        setIsEditingCompletedWorkout(false)
        loadData(user)
      }
    } else {
      if (confirm('Are you sure you want to exit this workout? Your progress will be saved but the workout will remain incomplete.')) {
        setCurrentWorkout(null)
        setWorkoutSets([])
        setIsEditingCompletedWorkout(false)
      }
    }
  }

// Cardio functions
  const addCardioWorkout = async () => {
    if (!cardioType.trim() || cardioDuration <= 0) {
      alert('Please enter exercise type and duration')
      return
    }

    try {
      await supabase
        .from('cardio_sessions')
        .insert({
          user_id: user.id,
          workout_date: new Date().toISOString().split('T')[0],
          exercise_type: cardioType,
          duration_minutes: cardioDuration,
          is_4x4: cardioIs4x4
        })

      setCardioType('')
      setCardioDuration(0)
      setCardioIs4x4(false)
      setShowCardioDialog(false)

      loadCardioData(user)

      const message = `Cardio workout logged: ${cardioType} for ${cardioDuration} minutes${cardioIs4x4 ? ' (Norwegian 4x4)' : ''}`
      alert(message)

    } catch (error) {
      console.error('Error adding cardio workout:', error)
      alert('Failed to log cardio workout')
    }
  }

  // Weight management functions
  const updateWeight = async (exerciseId, newWeight) => {
    try {
      await supabase
        .from('user_exercise_weights')
        .update({ prescribed_weight: newWeight })
        .eq('exercise_id', exerciseId)
        .eq('user_id', user.id)

      setUserWeights(prev => ({
        ...prev,
        [exerciseId]: newWeight
      }))
    } catch (error) {
      console.error('Error updating weight:', error)
    }
  }

  // Workout history functions
  const loadAllWorkouts = async () => {
    try {
      const { data: allWorkoutsData } = await supabase
        .from('workout_sessions')
        .select(`
          *,
          workout_sets (
            id,
            exercise_id,
            actual_weight,
            actual_reps,
            status,
            exercises (name)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      setAllWorkouts(allWorkoutsData || [])
      setShowAllWorkouts(true)
    } catch (error) {
      console.error('Error loading all workouts:', error)
    }
  }

  const loadWorkoutDetails = async (workout) => {
    try {
      const { data: setsData } = await supabase
        .from('workout_sets')
        .select(`
          *,
          exercises (name)
        `)
        .eq('session_id', workout.id)
        .eq('user_id', user.id)
        .order('exercise_id', { ascending: true })
        .order('set_number', { ascending: true })
      
      setWorkoutDetails(setsData || [])
      setSelectedWorkout(workout)
    } catch (error) {
      console.error('Error loading workout details:', error)
    }
  }

  const deleteWorkout = async (workoutId) => {
    if (!confirm('Are you sure you want to delete this workout? This action cannot be undone.')) {
      return
    }

    try {
      await supabase
        .from('workout_sets')
        .delete()
        .eq('session_id', workoutId)
        .eq('user_id', user.id)

      await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', workoutId)
        .eq('user_id', user.id)

      loadData(user)
      if (showAllWorkouts) {
        loadAllWorkouts()
      }
      
      if (selectedWorkout?.id === workoutId) {
        setSelectedWorkout(null)
      }

      alert('Workout deleted successfully!')
    } catch (error) {
      console.error('Error deleting workout:', error)
      alert('Failed to delete workout. Please try again.')
    }
  }

  // Set editing functions
  const startEditSet = (set) => {
    setEditingSet(set.id)
    setEditWeight(set.actual_weight)
    setEditReps(set.actual_reps)
  }

  const saveEditSet = async (setId) => {
    try {
      const set = workoutDetails.find(s => s.id === setId)
      let newStatus = 'Incomplete'
      
      if (editReps >= set.prescribed_reps && editWeight >= set.prescribed_weight) {
        newStatus = editReps > set.prescribed_reps || editWeight > set.prescribed_weight ? 'Exceeded' : 'Complete'
      }

      await supabase
        .from('workout_sets')
        .update({
          actual_weight: editWeight,
          actual_reps: editReps,
          status: newStatus
        })
        .eq('id', setId)

      setWorkoutDetails(prev => prev.map(s => 
        s.id === setId 
          ? { ...s, actual_weight: editWeight, actual_reps: editReps, status: newStatus }
          : s
      ))

      setEditingSet(null)
      loadData(user)
      if (showAllWorkouts) {
        loadAllWorkouts()
      }

    } catch (error) {
      console.error('Error updating set:', error)
      alert('Failed to update set. Please try again.')
    }
  }

  const cancelEditSet = () => {
    setEditingSet(null)
    setEditWeight(0)
    setEditReps(0)
  }

  const deleteSet = async (setId) => {
    if (!confirm('Are you sure you want to delete this set?')) {
      return
    }

    try {
      await supabase
        .from('workout_sets')
        .delete()
        .eq('id', setId)

      setWorkoutDetails(prev => prev.filter(s => s.id !== setId))
      loadData(user)
      if (showAllWorkouts) {
        loadAllWorkouts()
      }

    } catch (error) {
      console.error('Error deleting set:', error)
      alert('Failed to delete set. Please try again.')
    }
  }

  // Workout editing functions
  const editWorkout = async (workout) => {
    try {
      setCurrentWorkout(workout)
      setIsEditingCompletedWorkout(true)
      
      const { data: existingSets } = await supabase
        .from('workout_sets')
        .select(`
          *,
          exercises (name)
        `)
        .eq('session_id', workout.id)
        .order('exercise_id')
        .order('set_number')

      const convertedSets = existingSets.map(set => ({
        exercise_id: set.exercise_id,
        exercise_name: set.exercises.name,
        prescribed_weight: set.prescribed_weight,
        prescribed_reps: set.prescribed_reps,
        set_number: set.set_number,
        status: set.status,
        session_id: set.session_id,
        actual_weight: set.actual_weight,
        actual_reps: set.actual_reps,
        logged: true,
        set_id: set.id
      }))

      const existingExerciseIds = new Set(existingSets.map(s => s.exercise_id))
      const reps = getRepsForWeek(workout.week_number)
      
      exercises.forEach(exercise => {
        if (!existingExerciseIds.has(exercise.id)) {
          const prescribedWeight = userWeights[exercise.id] || 0
          const workoutWeight = calculateWorkoutWeight(prescribedWeight, workout.day_type)
          
          for (let i = 1; i <= 2; i++) {
            convertedSets.push({
              exercise_id: exercise.id,
              exercise_name: exercise.name,
              prescribed_weight: workoutWeight,
              prescribed_reps: reps,
              set_number: i,
              status: 'Incomplete',
              session_id: workout.id,
              logged: false
            })
          }
        }
      })

      convertedSets.sort((a, b) => {
        if (a.exercise_name !== b.exercise_name) {
          return a.exercise_name.localeCompare(b.exercise_name)
        }
        return a.set_number - b.set_number
      })

      setWorkoutSets(convertedSets)
      
      setCurrentCycle({
        week: workout.week_number,
        day: workout.day_type,
        cycle: workout.cycle_number
      })

      setSelectedWorkout(null)
      
    } catch (error) {
      console.error('Error editing workout:', error)
      alert('Failed to load workout for editing. Please try again.')
    }
  }

// Set management functions
  const addPrescribedSet = async (exerciseId, weight, reps) => {
    try {
      const exercise = exercises.find(e => e.id === exerciseId)
      const nextSetNumber = getNextSetNumber(exerciseId)
      
      const { data: newSet } = await supabase
        .from('workout_sets')
        .insert({
          user_id: user.id,
          session_id: currentWorkout.id,
          exercise_id: exerciseId,
          prescribed_weight: weight,
          actual_weight: weight,
          prescribed_reps: reps,
          actual_reps: reps,
          set_number: nextSetNumber,
          status: 'Complete'
        })
        .select()
        .single()

      const newWorkoutSet = {
        exercise_id: exerciseId,
        exercise_name: exercise.name,
        prescribed_weight: weight,
        prescribed_reps: reps,
        actual_weight: weight,
        actual_reps: reps,
        set_number: nextSetNumber,
        status: 'Complete',
        session_id: currentWorkout.id,
        logged: true,
        set_id: newSet.id
      }

      setWorkoutSets(prev => [...prev, newWorkoutSet])

      if (currentCycle.week === 5 && currentCycle.day === 'Heavy') {
        checkForLevelUp(exerciseId, [...workoutSets, newWorkoutSet])
      }

    } catch (error) {
      console.error('Error adding prescribed set:', error)
    }
  }

  const showCustomSetDialog = (exerciseId, defaultWeight, defaultReps) => {
    setCustomExerciseId(exerciseId)
    setCustomWeight(defaultWeight)
    setCustomReps(defaultReps)
    setShowingCustomDialog(true)
  }

  const addCustomSet = async () => {
    try {
      const exercise = exercises.find(e => e.id === customExerciseId)
      const nextSetNumber = getNextSetNumber(customExerciseId)
      const prescribedWeight = calculateWorkoutWeight(userWeights[customExerciseId] || 0, currentCycle.day)
      
      let status = 'Incomplete'
      if (customReps >= getRepsForWeek(currentCycle.week) && customWeight >= prescribedWeight) {
        status = customReps > getRepsForWeek(currentCycle.week) || customWeight > prescribedWeight ? 'Exceeded' : 'Complete'
      }

      const { data: newSet } = await supabase
        .from('workout_sets')
        .insert({
          user_id: user.id,
          session_id: currentWorkout.id,
          exercise_id: customExerciseId,
          prescribed_weight: prescribedWeight,
          actual_weight: customWeight,
          prescribed_reps: getRepsForWeek(currentCycle.week),
          actual_reps: customReps,
          set_number: nextSetNumber,
          status: status
        })
        .select()
        .single()

      const newWorkoutSet = {
        exercise_id: customExerciseId,
        exercise_name: exercise.name,
        prescribed_weight: prescribedWeight,
        prescribed_reps: getRepsForWeek(currentCycle.week),
        actual_weight: customWeight,
        actual_reps: customReps,
        set_number: nextSetNumber,
        status: status,
        session_id: currentWorkout.id,
        logged: true,
        set_id: newSet.id
      }

      setWorkoutSets(prev => [...prev, newWorkoutSet])
      setShowingCustomDialog(false)

      if (currentCycle.week === 5 && currentCycle.day === 'Heavy') {
        checkForLevelUp(customExerciseId, [...workoutSets, newWorkoutSet])
      }

    } catch (error) {
      console.error('Error adding custom set:', error)
    }
  }

  const getNextSetNumber = (exerciseId) => {
    const exerciseSets = workoutSets.filter(s => s.exercise_id === exerciseId && s.logged)
    return exerciseSets.length + 1
  }

  const editRecordedSet = (set, index) => {
    setEditingSet(index)
    setEditWeight(set.actual_weight)
    setEditReps(set.actual_reps)
  }

  const deleteRecordedSet = async (index) => {
    if (!confirm('Are you sure you want to delete this set?')) {
      return
    }

    const set = workoutSets[index]
    
    try {
      if (set.set_id) {
        await supabase
          .from('workout_sets')
          .delete()
          .eq('id', set.set_id)
      }

      setWorkoutSets(prev => prev.filter((_, i) => i !== index))

    } catch (error) {
      console.error('Error deleting recorded set:', error)
    }
  }

  // Loading and login screens
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full mx-4">
          <h1 className="text-3xl font-bold text-white text-center mb-2">
            Workout Tracker
          </h1>
          <p className="text-slate-300 text-center mb-8">
            Track your strength training and cardio workouts
          </p>
          
          <button
            onClick={signInWithGoogle}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
          
          <p className="text-slate-400 text-sm text-center mt-6">
            Your workout data will be securely stored and only accessible to you.
          </p>
        </div>
      </div>
    )
  }

  // Main component JSX starts here
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="bg-slate-800 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <h1 className="text-2xl font-bold">Workout Tracker</h1>
            <div className="text-slate-300 mt-2">
              Week {currentCycle.week} • {currentCycle.day} Day • Cycle {currentCycle.cycle}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm text-slate-300">
                {user.user_metadata?.full_name || user.email}
              </div>
              <div className="text-xs text-slate-400">
                {user.email}
              </div>
            </div>
            <button
              onClick={signOut}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
{selectedWorkout ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedWorkout(null)}
                  className="text-blue-400 hover:text-blue-300"
                >
                  ← Back
                </button>
                <h2 className="text-xl font-bold">Workout Details</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => editWorkout(selectedWorkout)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
                >
                  Edit Workout
                </button>
                <button
                  onClick={() => deleteWorkout(selectedWorkout.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm"
                >
                  Delete Workout
                </button>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-4">
              <div className="text-lg font-semibold">
                Week {selectedWorkout.week_number} • {selectedWorkout.day_type} Day
              </div>
              <div className="text-slate-300">
                {formatDateString(selectedWorkout.workout_date)} • Cycle {selectedWorkout.cycle_number}
              </div>
            </div>

            <div className="space-y-3">
              {workoutDetails.length > 0 ? (
                (() => {
                  const exerciseGroups = workoutDetails.reduce((acc, set) => {
                    const exerciseName = set.exercises?.name || 'Unknown Exercise'
                    if (!acc[exerciseName]) acc[exerciseName] = []
                    acc[exerciseName].push(set)
                    return acc
                  }, {})

                  return Object.entries(exerciseGroups).map(([exerciseName, sets]) => (
                    <div key={exerciseName} className="bg-slate-800 rounded-lg p-4">
                      <h4 className="font-semibold mb-2">{exerciseName}</h4>
                      <div className="space-y-2">
                        {sets.map((set, index) => (
                          <div key={set.id || index} className="bg-slate-700 rounded p-3">
                            {editingSet === set.id ? (
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">Set {set.set_number}</span>
                                  <span className="text-xs text-slate-400">
                                    Target: {set.prescribed_weight}kg × {set.prescribed_reps} reps
                                  </span>
                                </div>
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="number"
                                    step="0.25"
                                    value={editWeight}
                                    onChange={(e) => setEditWeight(parseFloat(e.target.value) || 0)}
                                    className="flex-1 bg-slate-600 text-white px-2 py-1 rounded text-sm"
                                    placeholder="Weight (kg)"
                                  />
                                  <span className="text-slate-400">×</span>
                                  <input
                                    type="number"
                                    value={editReps}
                                    onChange={(e) => setEditReps(parseInt(e.target.value) || 0)}
                                    className="flex-1 bg-slate-600 text-white px-2 py-1 rounded text-sm"
                                    placeholder="Reps"
                                  />
                                  <button
                                    onClick={() => saveEditSet(set.id)}
                                    className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEditSet}
                                    className="bg-slate-500 hover:bg-slate-400 px-2 py-1 rounded text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm">Set {set.set_number}</span>
                                  <span className="font-mono text-sm">{set.actual_weight}kg × {set.actual_reps} reps</span>
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    set.status === 'Complete' ? 'bg-green-600' :
                                    set.status === 'Exceeded' ? 'bg-blue-600' : 'bg-red-600'
                                  }`}>
                                    {set.status}
                                  </span>
                                  {(() => {
                                    const exerciseSets = workoutDetails.filter(s => s.exercise_id === set.exercise_id)
                                    const completedSets = exerciseSets.filter(s => s.status === 'Complete' || s.status === 'Exceeded')
                                    const isWeek5Heavy = selectedWorkout?.week_number === 5 && selectedWorkout?.day_type === 'Heavy'
                                    
                                    if (isWeek5Heavy && completedSets.length >= 2) {
                                      return (
                                        <span className="px-2 py-1 rounded text-xs bg-yellow-600 font-bold">
                                          🎉 Level Up!
                                        </span>
                                      )
                                    }
                                    return null
                                  })()}
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => startEditSet(set)}
                                    className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => deleteSet(set.id)}
                                    className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                })()
              ) : (
                <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-400">
                  No exercises recorded for this workout
                </div>
              )}
            </div>
          </div>
        ) : showAllWorkouts ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowAllWorkouts(false)}
                className="text-blue-400 hover:text-blue-300"
              >
                ← Back
              </button>
              <h2 className="text-xl font-bold">All Workouts</h2>
            </div>

            <div className="space-y-3">
              {allWorkouts.map(workout => (
                <div
                  key={workout.id}
                  onClick={() => loadWorkoutDetails(workout)}
                  className="bg-slate-800 hover:bg-slate-700 rounded-lg p-4 cursor-pointer transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">
                        Week {workout.week_number} • {workout.day_type} Day
                      </div>
                      <div className="text-slate-300 text-sm">
                        {formatDateString(workout.workout_date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-300">
                        Cycle {workout.cycle_number}
                      </div>
                      <div className="text-xs text-slate-400">
                        {getWorkoutSummary(workout)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : !currentWorkout ? (
<div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">💪 Strength Training</h3>
              
              <button
                onClick={startWorkout}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-xl mb-4"
              >
                Start Today's Workout
              </button>

              <div className="bg-slate-700 rounded-lg p-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-blue-400">Weekly Target</span>
                  <span className="text-sm text-slate-300">
                    {getWeeklyWorkoutCount()}/3 workouts
                  </span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      getWeeklyWorkoutCount() >= 3 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min((getWeeklyWorkoutCount() / 3) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  This calendar week {getWeeklyWorkoutCount() >= 3 ? '✅ Target achieved!' : `(${3 - getWeeklyWorkoutCount()} more needed)`}
                </div>
              </div>

              <div className="bg-slate-700 rounded-lg p-3">
                <h4 className="font-medium mb-2">Today's Workout Preview</h4>
                <div className="text-sm text-slate-300 mb-2">
                  {getRepsForWeek(currentCycle.week)} reps × 2 sets each exercise
                </div>
                <div className="space-y-1 text-sm">
                  {exercises.slice(0, 3).map(exercise => {
                    const weight = calculateWorkoutWeight(userWeights[exercise.id] || 0, currentCycle.day)
                    return (
                      <div key={exercise.id} className="flex justify-between">
                        <span>{exercise.name}</span>
                        <span className="text-blue-400 font-mono">{weight}kg</span>
                      </div>
                    )
                  })}
                  {exercises.length > 3 && (
                    <div className="text-slate-400 text-xs">+ {exercises.length - 3} more exercises</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-green-400">🏃 Cardio Training</h3>
              
              <button
                onClick={() => setShowCardioDialog(true)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg mb-3"
              >
                Log Cardio Workout
              </button>

              <div className="bg-slate-700 rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-yellow-400">Norwegian 4x4</span>
                  <span className="text-sm text-slate-300">
                    Due: {next4x4Date ? formatDate(next4x4Date) : 'This Sunday'}
                  </span>
                </div>
                {missed4x4Count > 0 && (
                  <div className="text-red-400 text-sm mt-1">
                    ⚠️ {missed4x4Count} missed in last 12 weeks
                  </div>
                )}
              </div>

              <div className="bg-slate-700 rounded-lg p-3 mb-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-blue-400">Zone 2 Training</span>
                  <span className="text-sm text-slate-300">
                    {zone2Minutes}/150 min
                  </span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      zone2Minutes >= 150 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min((zone2Minutes / 150) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Last 7 days {zone2Minutes >= 150 ? '✅ Target met!' : `(${150 - zone2Minutes} min to go)`}
                </div>
              </div>

              {recentCardio.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Recent Sessions:</h4>
                  {recentCardio.slice(0, 2).map(session => (
                    <div key={session.id} className="bg-slate-700 rounded p-2 text-sm">
                      <div className="flex justify-between">
                        <span>{session.exercise_type}</span>
                        <span>{session.duration_minutes} min</span>
                      </div>
                      <div className="text-slate-400 text-xs">
                        {formatDateString(session.workout_date)}
                        {session.is_4x4 && <span className="text-yellow-400 ml-2">4x4</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowWeightManager(!showWeightManager)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 px-4 rounded-lg"
            >
              Manage Weights
            </button>

            {showWeightManager && (
              <div className="bg-slate-800 rounded-lg p-4 space-y-3">
                <h3 className="text-lg font-semibold">Prescribed Weights (kg)</h3>
                {exercises.map(exercise => (
                  <div key={exercise.id} className="flex items-center justify-between">
                    <label className="flex-1">{exercise.name}</label>
                    <input
                      type="number"
                      step="0.25"
                      value={userWeights[exercise.id] || 0}
                      onChange={(e) => updateWeight(exercise.id, parseFloat(e.target.value) || 0)}
                      className="w-20 bg-slate-700 text-white px-2 py-1 rounded text-center"
                    />
                  </div>
                ))}
              </div>
            )}

            {recentWorkouts.length > 0 && (
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Recent Workouts</h3>
                  <button
                    onClick={loadAllWorkouts}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-2">
                  {recentWorkouts.map(workout => (
                    <div
                      key={workout.id}
                      onClick={() => loadWorkoutDetails(workout)}
                      className="bg-slate-700 hover:bg-slate-600 rounded p-3 cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-sm">
                            💪 Week {workout.week_number} • {workout.day_type}
                          </div>
                          <div className="text-xs text-slate-300">
                            {formatDateString(workout.workout_date)}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {getWorkoutSummary(workout)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentCardio.slice(0, 2).map(session => (
                    <div key={`cardio-${session.id}`} className="bg-slate-700 rounded p-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-sm">
                            🏃 {session.exercise_type}
                          </div>
                          <div className="text-xs text-slate-300">
                            {formatDateString(session.workout_date)}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {session.duration_minutes} min
                          {session.is_4x4 && <span className="text-yellow-400 ml-1">4x4</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cardio Dialog */}
            {showCardioDialog && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 rounded-lg p-6 w-full max-w-sm">
                  <h3 className="text-lg font-semibold mb-4">Log Cardio Workout</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Exercise Type</label>
                      <input
                        type="text"
                        value={cardioType}
                        onChange={(e) => setCardioType(e.target.value)}
                        className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                        placeholder="e.g., Running, Cycling, Rowing"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Duration (minutes)</label>
                      <input
                        type="number"
                        value={cardioDuration}
                        onChange={(e) => setCardioDuration(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is4x4"
                        checked={cardioIs4x4}
                        onChange={(e) => setCardioIs4x4(e.target.checked)}
                        className="bg-slate-700"
                      />
                      <label htmlFor="is4x4" className="text-sm text-slate-300">
                        This is a Norwegian 4x4 session
                      </label>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={addCardioWorkout}
                        className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded"
                      >
                        Log Workout
                      </button>
                      <button
                        onClick={() => setShowCardioDialog(false)}
                        className="flex-1 bg-slate-600 hover:bg-slate-500 py-2 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

                    ) : (
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
              <h2 className="text-xl font-bold mb-2">
                {isEditingCompletedWorkout ? 'Editing Completed Workout' : 'Active Workout'}
              </h2>
              <div className="text-slate-300">
                Week {currentCycle.week} • {currentCycle.day} Day • {getRepsForWeek(currentCycle.week)} reps per set
                {isEditingCompletedWorkout && (
                  <div className="text-yellow-400 text-sm mt-1">
                    ⚠️ Editing completed workout - changes will be saved to existing session
                  </div>
                )}
              </div>
            </div>

            {workoutSets.filter(set => set.logged).length > 0 && (
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3">Recorded Sets</h3>
                <div className="space-y-2">
                  {workoutSets
                    .filter(set => set.logged)
                    .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name))
                    .map((set, index) => (
                    <div key={set.set_id || index} className="flex items-center justify-between bg-slate-700 rounded p-3">
                      {editingSet === index ? (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-medium">{set.exercise_name}</span>
                          <input
                            type="number"
                            step="0.25"
                            value={editWeight}
                            onChange={(e) => setEditWeight(parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-600 text-white px-2 py-1 rounded text-sm"
                          />
                          <span className="text-slate-400">×</span>
                          <input
                            type="number"
                            value={editReps}
                            onChange={(e) => setEditReps(parseInt(e.target.value) || 0)}
                            className="w-16 bg-slate-600 text-white px-2 py-1 rounded text-sm"
                          />
                          <button
                            onClick={() => {
                              const updatedSets = [...workoutSets]
                              updatedSets[index] = {
                                ...set,
                                actual_weight: editWeight,
                                actual_reps: editReps
                              }
                              setWorkoutSets(updatedSets)
                              logSet(index, editWeight, editReps)
                              setEditingSet(null)
                            }}
                            className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingSet(null)}
                            className="bg-slate-500 hover:bg-slate-400 px-2 py-1 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{set.exercise_name}</span>
                            <span className="font-mono text-sm">{set.actual_weight}kg × {set.actual_reps} reps</span>
                            <span className={`px-2 py-1 rounded text-xs ${
                              set.status === 'Complete' ? 'bg-green-600' :
                              set.status === 'Exceeded' ? 'bg-blue-600' : 'bg-red-600'
                            }`}>
                              {set.status}
                            </span>
                            {isLevelUpEligible(set.exercise_id) && (
                              <span className="px-2 py-1 rounded text-xs bg-yellow-600 font-bold">
                                🎉 Level Up!
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => editRecordedSet(set, index)}
                              className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteRecordedSet(index)}
                              className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {exercises.map(exercise => {
                const prescribedWeight = userWeights[exercise.id] || 0
                const workoutWeight = calculateWorkoutWeight(prescribedWeight, currentCycle.day)
                const reps = getRepsForWeek(currentCycle.week)
                
                return (
                  <div key={exercise.id} className="bg-slate-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{exercise.name}</h4>
                        <div className="text-sm text-slate-300">
                          Target: 2 sets × {reps} reps × {workoutWeight}kg
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => addPrescribedSet(exercise.id, workoutWeight, reps)}
                          className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm"
                        >
                          Add Prescribed Set
                        </button>
                        <button
                          onClick={() => showCustomSetDialog(exercise.id, workoutWeight, reps)}
                          className="bg-slate-600 hover:bg-slate-500 px-3 py-2 rounded text-sm"
                        >
                          Add Custom Set
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Custom Set Dialog */}
            {showingCustomDialog && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-slate-800 rounded-lg p-6 w-full max-w-sm">
                  <h3 className="text-lg font-semibold mb-4">Add Custom Set</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Weight (kg)</label>
                      <input
                        type="number"
                        step="0.25"
                        value={customWeight}
                        onChange={(e) => setCustomWeight(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Reps</label>
                      <input
                        type="number"
                        value={customReps}
                        onChange={(e) => setCustomReps(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={addCustomSet}
                        className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded"
                      >
                        Add Set
                      </button>
                      <button
                        onClick={() => setShowingCustomDialog(false)}
                        className="flex-1 bg-slate-600 hover:bg-slate-500 py-2 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={exitWorkout}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg"
              >
                {isEditingCompletedWorkout ? 'Discard Changes' : 'Exit Workout'}
              </button>
              <button
                onClick={finishWorkout}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg"
              >
                {isEditingCompletedWorkout ? 'Save Changes' : 'Complete Workout'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
