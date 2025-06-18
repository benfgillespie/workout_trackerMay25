"use client"

// Part 1: Imports and State Setup
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Cache for exercises data
let exercisesCache = null

export default function WorkoutTracker() {
  // Auth state
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Data state
  const [exercises, setExercises] = useState([])
  const [userWeights, setUserWeights] = useState({})
  const [recentWorkouts, setRecentWorkouts] = useState([])
  const [allWorkouts, setAllWorkouts] = useState([])
  const [workoutSets, setWorkoutSets] = useState([])
  const [currentCycle, setCurrentCycle] = useState({ week: 1, day: 'Heavy', cycle: 1 })
  const [dataLoading, setDataLoading] = useState(false)
  
  // UI state
  const [showWeightManager, setShowWeightManager] = useState(false)
  const [currentWorkout, setCurrentWorkout] = useState(null)
  const [editingSet, setEditingSet] = useState(null)
  const [editWeight, setEditWeight] = useState(0)
  const [editReps, setEditReps] = useState(0)
  const [selectedWorkout, setSelectedWorkout] = useState(null)
  const [workoutDetails, setWorkoutDetails] = useState([])
  const [showAllWorkouts, setShowAllWorkouts] = useState(false)
  const [isEditingCompletedWorkout, setIsEditingCompletedWorkout] = useState(false)
  
  // Custom set dialog state
  const [showingCustomDialog, setShowingCustomDialog] = useState(false)
  const [customExerciseId, setCustomExerciseId] = useState(null)
  const [customWeight, setCustomWeight] = useState(0)
  const [customReps, setCustomReps] = useState(0)
  
  // Cardio state - lazy loaded
  const [cardioDataLoaded, setCardioDataLoaded] = useState(false)
  const [showCardioDialog, setShowCardioDialog] = useState(false)
  const [cardioType, setCardioType] = useState('')
  const [cardioDuration, setCardioDuration] = useState(0)
  const [cardioIs4x4, setCardioIs4x4] = useState(false)
  const [zone2Minutes, setZone2Minutes] = useState(0)
  const [recentCardio, setRecentCardio] = useState([])
  const [next4x4Date, setNext4x4Date] = useState(null)
  const [missed4x4Count, setMissed4x4Count] = useState(0)

// Part 2: Auth and Data Loading Functions
  
  // Parallel initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      try {
        // Check auth state
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
        
        if (user) {
          // Load data in parallel
          await Promise.all([
            loadExercises(),
            loadUserData(user.id)
          ])
        }
      } catch (error) {
        console.error('Error loading initial data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
    
    // Set up auth listener
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserData(session.user.id)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  // Load exercises from cache or database
  const loadExercises = async () => {
    if (exercisesCache) {
      setExercises(exercisesCache)
      return
    }

    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .order('name')
      
      if (error) throw error
      
      exercisesCache = data || []
      setExercises(exercisesCache)
    } catch (error) {
      console.error('Error loading exercises:', error)
    }
  }

  // Main user data loading function - no more recursion
  const loadUserData = async (userId) => {
    if (!userId) return
    
    setDataLoading(true)
    try {
      // Load all user data in parallel
      const [weightsData, progressData, workoutsData] = await Promise.all([
        // Load weights
        supabase
          .from('user_weights')
          .select('*')
          .eq('user_id', userId),
        
        // Load latest progress
        supabase
          .from('user_progress')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        
        // Load recent workouts
        supabase
          .from('workout_sessions')
          .select(`
            *,
            workout_sets!inner (
              count
            )
          `)
          .eq('user_id', userId)
          .order('workout_date', { ascending: false })
          .limit(5)
      ])

      // Process weights
      if (weightsData.data) {
        const weights = {}
        weightsData.data.forEach(w => {
          weights[w.exercise_id] = w.weight
        })
        setUserWeights(weights)
      }

      // Process progress
      if (progressData.data && progressData.data.length > 0) {
        const progress = progressData.data[0]
        setCurrentCycle({
          week: progress.current_week,
          day: progress.current_day,
          cycle: progress.current_cycle
        })
      }

      // Process workouts
      if (workoutsData.data) {
        setRecentWorkouts(workoutsData.data)
      }

    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      setDataLoading(false)
    }
  }

  // Lazy load cardio data when needed
  const loadCardioData = useCallback(async () => {
    if (!user || cardioDataLoaded) return
    
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const twelveWeeksAgo = new Date()
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84)

      const [zone2Data, cardioData, recent4x4Data] = await Promise.all([
        // Zone 2 minutes
        supabase
          .from('cardio_sessions')
          .select('duration_minutes')
          .eq('user_id', user.id)
          .gte('workout_date', sevenDaysAgo.toISOString().split('T')[0])
          .not('is_4x4', 'is', true),
        
        // Recent cardio
        supabase
          .from('cardio_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('workout_date', { ascending: false })
          .limit(5),
        
        // 4x4 workouts
        supabase
          .from('cardio_sessions')
          .select('workout_date')
          .eq('user_id', user.id)
          .eq('is_4x4', true)
          .gte('workout_date', twelveWeeksAgo.toISOString().split('T')[0])
          .order('workout_date', { ascending: false })
      ])

      // Calculate zone 2 minutes
      const totalZone2 = zone2Data.data?.reduce((sum, session) => sum + session.duration_minutes, 0) || 0
      setZone2Minutes(totalZone2)

      // Set recent cardio
      setRecentCardio(cardioData.data || [])

      // Calculate missed 4x4s
      if (recent4x4Data.data) {
        const mostRecentDate = recent4x4Data.data[0]?.workout_date
        if (mostRecentDate) {
          const lastWorkout = new Date(mostRecentDate)
          const daysSince = Math.floor((new Date() - lastWorkout) / (1000 * 60 * 60 * 24))
          const missedWeeks = Math.floor(daysSince / 7)
          setMissed4x4Count(Math.max(0, missedWeeks))
          
          const nextDate = new Date(lastWorkout)
          nextDate.setDate(nextDate.getDate() + 7)
          setNext4x4Date(nextDate)
        } else {
          setMissed4x4Count(12)
          setNext4x4Date(new Date())
        }
      }

      setCardioDataLoaded(true)
    } catch (error) {
      console.error('Error loading cardio data:', error)
    }
  }, [user, cardioDataLoaded])

  // Auth functions
  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.href
        }
      })
      if (error) throw error
    } catch (error) {
      console.error('Error signing in:', error)
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setUserWeights({})
      setRecentWorkouts([])
      setAllWorkouts([])
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }


// Part 3: Core Workout Functions

  // Utility functions
  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date)
  }

  const formatDateString = (dateString) => {
    return formatDate(new Date(dateString))
  }

  // Calculate workout weight based on percentage (memoized)
  const calculateWorkoutWeight = useCallback((prescribedWeight, dayType) => {
    const percentage = dayType === 'Heavy' ? 1.0 : dayType === 'Medium' ? 0.85 : 0.70
    const calculated = prescribedWeight * percentage
    return Math.round(calculated * 4) / 4 // Round to nearest 0.25
  }, [])

  // Get reps for week (memoized)
  const getRepsForWeek = useCallback((week) => {
    const repsMap = { 1: 8, 2: 6, 3: 4, 4: 3, 5: 2 }
    return repsMap[week] || 8
  }, [])

  // Debounced weight update
  const updateWeightDebounced = useMemo(() => {
    let timeout
    return async (exerciseId, weight, userId) => {
      clearTimeout(timeout)
      timeout = setTimeout(async () => {
        try {
          await supabase
            .from('user_weights')
            .upsert({
              user_id: userId,
              exercise_id: exerciseId,
              weight: weight,
              updated_at: new Date().toISOString()
            })
        } catch (error) {
          console.error('Error updating weight:', error)
        }
      }, 500)
    }
  }, [])

  const updateWeight = useCallback((exerciseId, weight) => {
    setUserWeights(prev => ({ ...prev, [exerciseId]: weight }))
    if (user) {
      updateWeightDebounced(exerciseId, weight, user.id)
    }
  }, [user, updateWeightDebounced])

  // Start workout
  const startWorkout = async () => {
    if (!user || currentWorkout) return

    try {
      setDataLoading(true)
      
      // Create workout session
      const { data: newWorkout, error } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: user.id,
          week_number: currentCycle.week,
          day_type: currentCycle.day,
          cycle_number: currentCycle.cycle,
          workout_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single()

      if (error) throw error

      setCurrentWorkout(newWorkout)

      // Prepare workout sets
      const reps = getRepsForWeek(currentCycle.week)
      const sets = exercises.flatMap(exercise => {
        const prescribedWeight = userWeights[exercise.id] || 0
        const workoutWeight = calculateWorkoutWeight(prescribedWeight, currentCycle.day)
        
        return [1, 2].map(setNumber => ({
          exercise_id: exercise.id,
          exercise_name: exercise.name,
          prescribed_weight: workoutWeight,
          prescribed_reps: reps,
          set_number: setNumber,
          status: 'Incomplete',
          session_id: newWorkout.id,
          logged: false
        }))
      })

      setWorkoutSets(sets)
    } catch (error) {
      console.error('Error starting workout:', error)
      alert('Failed to start workout. Please try again.')
    } finally {
      setDataLoading(false)
    }
  }

  // Exit workout
  const exitWorkout = useCallback(() => {
    if (confirm('Are you sure you want to exit? Unlogged sets will be lost.')) {
      setCurrentWorkout(null)
      setWorkoutSets([])
      setIsEditingCompletedWorkout(false)
      loadUserData(user.id)
    }
  }, [user])

  // Check for level up (memoized calculation)
  const checkForLevelUp = useCallback((exerciseId, allSets) => {
    const exerciseSets = allSets.filter(s => 
      s.exercise_id === exerciseId && 
      (s.status === 'Complete' || s.status === 'Exceeded')
    )
    
    if (exerciseSets.length >= 2) {
      alert(`🎉 Level up! Increase your ${exercises.find(e => e.id === exerciseId)?.name} weight for next week!`)
    }
  }, [exercises])

  const isLevelUpEligible = useCallback((exerciseId) => {
    if (currentCycle.week !== 5 || currentCycle.day !== 'Heavy') return false
    
    const exerciseSets = workoutSets.filter(s => 
      s.exercise_id === exerciseId && 
      s.logged && 
      (s.status === 'Complete' || s.status === 'Exceeded')
    )
    
    return exerciseSets.length >= 2
  }, [currentCycle, workoutSets])

  // Log set
  const logSet = useCallback(async (index, weight, reps) => {
    const set = workoutSets[index]
    if (!set || set.logged) return

    try {
      let status = 'Incomplete'
      if (reps >= set.prescribed_reps && weight >= set.prescribed_weight) {
        status = (reps > set.prescribed_reps || weight > set.prescribed_weight) ? 'Exceeded' : 'Complete'
      }

      const { data: newSet, error } = await supabase
        .from('workout_sets')
        .insert({
          user_id: user.id,
          session_id: set.session_id,
          exercise_id: set.exercise_id,
          prescribed_weight: set.prescribed_weight,
          actual_weight: weight,
          prescribed_reps: set.prescribed_reps,
          actual_reps: reps,
          set_number: set.set_number,
          status: status
        })
        .select()
        .single()

      if (error) throw error

      const updatedSets = [...workoutSets]
      updatedSets[index] = {
        ...set,
        actual_weight: weight,
        actual_reps: reps,
        status: status,
        logged: true,
        set_id: newSet.id
      }
      setWorkoutSets(updatedSets)

      // Check for level up on week 5 heavy day
      if (currentCycle.week === 5 && currentCycle.day === 'Heavy') {
        checkForLevelUp(set.exercise_id, updatedSets)
      }

    } catch (error) {
      console.error('Error logging set:', error)
    }
  }, [workoutSets, user, currentCycle, checkForLevelUp])

  // Finish workout
  const finishWorkout = async () => {
    if (!currentWorkout || !user) return

    try {
      // Calculate next workout
      let nextWeek = currentCycle.week
      let nextDay = currentCycle.day
      let nextCycle = currentCycle.cycle

      if (currentCycle.day === 'Heavy') {
        nextDay = 'Medium'
      } else if (currentCycle.day === 'Medium') {
        nextDay = 'Light'
      } else {
        nextDay = 'Heavy'
        nextWeek++
        if (nextWeek > 5) {
          nextWeek = 1
          nextCycle++
        }
      }

      // Update progress
      await supabase
        .from('user_progress')
        .upsert({
          user_id: user.id,
          current_week: nextWeek,
          current_day: nextDay,
          current_cycle: nextCycle,
          updated_at: new Date().toISOString()
        })

      // Clear workout state
      setCurrentWorkout(null)
      setWorkoutSets([])
      setCurrentCycle({ week: nextWeek, day: nextDay, cycle: nextCycle })
      setIsEditingCompletedWorkout(false)

      // Reload data
      loadUserData(user.id)
      
      alert('Workout completed! Great job! 💪')
    } catch (error) {
      console.error('Error finishing workout:', error)
      alert('Failed to save workout. Please try again.')
    }
  }


// Part 4: Additional Functions - Cardio, CRUD operations, etc.

  // Cardio functions
  const addCardioWorkout = async () => {
    if (!user || !cardioType || cardioDuration <= 0) return

    try {
      await supabase
        .from('cardio_sessions')
        .insert({
          user_id: user.id,
          exercise_type: cardioType,
          duration_minutes: cardioDuration,
          is_4x4: cardioIs4x4,
          workout_date: new Date().toISOString().split('T')[0]
        })

      setShowCardioDialog(false)
      setCardioType('')
      setCardioDuration(0)
      setCardioIs4x4(false)
      
      // Reload cardio data
      loadCardioData()
      
      alert('Cardio workout logged! 🏃')
    } catch (error) {
      console.error('Error adding cardio workout:', error)
      alert('Failed to log cardio workout. Please try again.')
    }
  }

  // Get weekly workout count
  const getWeeklyWorkoutCount = useMemo(() => {
    const currentDate = new Date()
    const currentDay = currentDate.getDay()
    const weekStart = new Date(currentDate)
    weekStart.setDate(currentDate.getDate() - currentDay)
    weekStart.setHours(0, 0, 0, 0)
    
    return recentWorkouts.filter(w => {
      const workoutDate = new Date(w.workout_date)
      return workoutDate >= weekStart
    }).length
  }, [recentWorkouts])

  // Get workout summary
  const getWorkoutSummary = useCallback((workout) => {
    const setCount = workout.workout_sets?.[0]?.count || 0
    return `${setCount} sets completed`
  }, [])

  // Load all workouts
  const loadAllWorkouts = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select(`
          *,
          workout_sets!inner (
            count
          )
        `)
        .eq('user_id', user.id)
        .order('workout_date', { ascending: false })

      if (error) throw error
      
      setAllWorkouts(data || [])
      setShowAllWorkouts(true)
    } catch (error) {
      console.error('Error loading all workouts:', error)
    }
  }

  // Load workout details
  const loadWorkoutDetails = async (workout) => {
    try {
      const { data, error } = await supabase
        .from('workout_sets')
        .select(`
          *,
          exercises (name)
        `)
        .eq('session_id', workout.id)
        .order('exercise_id')
        .order('set_number')

      if (error) throw error

      setWorkoutDetails(data || [])
      setSelectedWorkout(workout)
    } catch (error) {
      console.error('Error loading workout details:', error)
    }
  }

  // Edit set functions
  const startEditSet = useCallback((set) => {
    setEditingSet(set.id)
    setEditWeight(set.actual_weight)
    setEditReps(set.actual_reps)
  }, [])

  const cancelEditSet = useCallback(() => {
    setEditingSet(null)
    setEditWeight(0)
    setEditReps(0)
  }, [])

  const saveEditSet = useCallback(async (setId) => {
    try {
      let status = 'Incomplete'
      const set = workoutDetails.find(s => s.id === setId)
      
      if (editReps >= set.prescribed_reps && editWeight >= set.prescribed_weight) {
        status = (editReps > set.prescribed_reps || editWeight > set.prescribed_weight) ? 'Exceeded' : 'Complete'
      }

      await supabase
        .from('workout_sets')
        .update({
          actual_weight: editWeight,
          actual_reps: editReps,
          status: status
        })
        .eq('id', setId)

      // Update local state
      setWorkoutDetails(prev => prev.map(s => 
        s.id === setId 
          ? { ...s, actual_weight: editWeight, actual_reps: editReps, status }
          : s
      ))

      cancelEditSet()
    } catch (error) {
      console.error('Error updating set:', error)
    }
  }, [editWeight, editReps, workoutDetails, cancelEditSet])

  // Delete functions
  const deleteWorkout = useCallback(async (workoutId) => {
    if (!confirm('Are you sure you want to delete this workout? This action cannot be undone.')) {
      return
    }

    try {
      await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', workoutId)

      setSelectedWorkout(null)
      setWorkoutDetails([])
      
      // Update recent workouts
      setRecentWorkouts(prev => prev.filter(w => w.id !== workoutId))
      
      // Update all workouts if loaded
      if (showAllWorkouts) {
        setAllWorkouts(prev => prev.filter(w => w.id !== workoutId))
      }

      alert('Workout deleted successfully')
    } catch (error) {
      console.error('Error deleting workout:', error)
      alert('Failed to delete workout. Please try again.')
    }
  }, [showAllWorkouts])

  const deleteSet = useCallback(async (setId) => {
    if (!confirm('Are you sure you want to delete this set?')) {
      return
    }

    try {
      await supabase
        .from('workout_sets')
        .delete()
        .eq('id', setId)

      setWorkoutDetails(prev => prev.filter(s => s.id !== setId))

      // Update recent workouts set count
      if (selectedWorkout) {
        setRecentWorkouts(prev => prev.map(w => {
          if (w.id === selectedWorkout.id) {
            const updatedSets = w.workout_sets?.filter(s => s.id !== setId) || []
            return { ...w, workout_sets: updatedSets }
          }
          return w
        }))
      }

    } catch (error) {
      console.error('Error deleting set:', error)
      alert('Failed to delete set. Please try again.')
    }
  }, [selectedWorkout])

  // Optimized workout editing
  const editWorkout = useCallback(async (workout) => {
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

      // Convert existing sets
      const convertedSets = existingSets?.map(set => ({
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
      })) || []

      // Add missing exercises
      const existingExerciseIds = new Set(existingSets?.map(s => s.exercise_id) || [])
      const reps = getRepsForWeek(workout.week_number)
      
      const newSets = exercises
        .filter(exercise => !existingExerciseIds.has(exercise.id))
        .flatMap(exercise => {
          const prescribedWeight = userWeights[exercise.id] || 0
          const workoutWeight = calculateWorkoutWeight(prescribedWeight, workout.day_type)
          
          return [1, 2].map(setNumber => ({
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            prescribed_weight: workoutWeight,
            prescribed_reps: reps,
            set_number: setNumber,
            status: 'Incomplete',
            session_id: workout.id,
            logged: false
          }))
        })

      const allSets = [...convertedSets, ...newSets].sort((a, b) => {
        if (a.exercise_name !== b.exercise_name) {
          return a.exercise_name.localeCompare(b.exercise_name)
        }
        return a.set_number - b.set_number
      })

      setWorkoutSets(allSets)
      
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
  }, [exercises, userWeights, calculateWorkoutWeight, getRepsForWeek])


// Part 5: Set Management Functions

  // Optimized set management
  const addPrescribedSet = useCallback(async (exerciseId, weight, reps) => {
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

      setWorkoutSets(prev => {
        const updated = [...prev, newWorkoutSet]
        
        if (currentCycle.week === 5 && currentCycle.day === 'Heavy') {
          checkForLevelUp(exerciseId, updated)
        }
        
        return updated
      })

    } catch (error) {
      console.error('Error adding prescribed set:', error)
    }
  }, [exercises, user, currentWorkout, currentCycle, checkForLevelUp])

  const showCustomSetDialog = useCallback((exerciseId, defaultWeight, defaultReps) => {
    setCustomExerciseId(exerciseId)
    setCustomWeight(defaultWeight)
    setCustomReps(defaultReps)
    setShowingCustomDialog(true)
  }, [])

  const addCustomSet = useCallback(async () => {
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

      setWorkoutSets(prev => {
        const updated = [...prev, newWorkoutSet]
        
        if (currentCycle.week === 5 && currentCycle.day === 'Heavy') {
          checkForLevelUp(customExerciseId, updated)
        }
        
        return updated
      })
      
      setShowingCustomDialog(false)

    } catch (error) {
      console.error('Error adding custom set:', error)
    }
  }, [customExerciseId, customWeight, customReps, exercises, user, currentWorkout, 
      currentCycle, userWeights, calculateWorkoutWeight, getRepsForWeek, checkForLevelUp])

  const getNextSetNumber = useCallback((exerciseId) => {
    const exerciseSets = workoutSets.filter(s => s.exercise_id === exerciseId && s.logged)
    return exerciseSets.length + 1
  }, [workoutSets])

  const editRecordedSet = useCallback((set, index) => {
    setEditingSet(index)
    setEditWeight(set.actual_weight)
    setEditReps(set.actual_reps)
  }, [])

  const deleteRecordedSet = useCallback(async (index) => {
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
  }, [workoutSets])

  // Memoized components to prevent re-renders
  const MemoizedExerciseList = useMemo(() => {
    if (!currentWorkout) return null
    
    return exercises.map(exercise => {
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
    })
  }, [exercises, userWeights, currentCycle, currentWorkout, calculateWorkoutWeight, 
      getRepsForWeek, addPrescribedSet, showCustomSetDialog])


// Part 6: UI Components and Rendering

  // Loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  // Login screen
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
          // Workout Details View
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
          // All Workouts View
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

// Home View - Modified to load cardio data on demand
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">💪 Strength Training</h3>
              
              <button
                onClick={startWorkout}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-xl mb-4"
                disabled={dataLoading}
              >
                {dataLoading ? 'Loading...' : 'Start Today\'s Workout'}
              </button>

              <div className="bg-slate-700 rounded-lg p-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-blue-400">Weekly Target</span>
                  <span className="text-sm text-slate-300">
                    {getWeeklyWorkoutCount}/3 workouts
                  </span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-2 mt-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      getWeeklyWorkoutCount >= 3 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min((getWeeklyWorkoutCount / 3) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  This calendar week {getWeeklyWorkoutCount >= 3 ? '✅ Target achieved!' : `(${3 - getWeeklyWorkoutCount} more needed)`}
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
                onClick={() => {
                  setShowCardioDialog(true)
                  if (!cardioDataLoaded) {
                    loadCardioData()
                  }
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg mb-3"
              >
                Log Cardio Workout
              </button>

              {cardioDataLoaded ? (
                <>
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
                </>
              ) : (
                <button
                  onClick={loadCardioData}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded text-sm"
                >
                  Load Cardio Stats
                </button>
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
                      className="w-20 bg-slate-700 text-white px-2 py-1 rounded text-right"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Recent Workouts</h3>
              <div className="space-y-3">
                {recentWorkouts.length > 0 ? (
                  recentWorkouts.map(workout => (
                    <div
                      key={workout.id}
                      onClick={() => loadWorkoutDetails(workout)}
                      className="bg-slate-700 hover:bg-slate-600 rounded-lg p-3 cursor-pointer transition-colors"
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
                  ))
                ) : (
                  <div className="text-slate-400 text-center py-4">
                    No workouts recorded yet. Start your first workout!
                  </div>
                )}
              </div>
              {recentWorkouts.length > 0 && (
                <button
                  onClick={() => loadAllWorkouts()}
                  className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded text-sm"
                >
                  View All Workouts
                </button>
              )}
            </div>
          </div>
        ) : (
          // Active Workout View
          <div className="space-y-4">
            <div className="bg-slate-800 rounded-lg p-4 sticky top-0 z-10">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold">
                  {isEditingCompletedWorkout ? 'Editing' : 'Current'} Workout
                </h2>
                <button
                  onClick={exitWorkout}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-sm"
                >
                  Exit {isEditingCompletedWorkout ? 'Edit Mode' : 'Workout'}
                </button>
              </div>
              <div className="text-slate-300">
                Week {currentCycle.week} • {currentCycle.day} Day • 
                {getRepsForWeek(currentCycle.week)} reps × 2 sets
              </div>
              <div className="mt-2 flex gap-2 text-sm">
                <span className="bg-green-600 px-2 py-1 rounded">
                  Complete: {workoutSets.filter(s => s.status === 'Complete').length}
                </span>
                <span className="bg-blue-600 px-2 py-1 rounded">
                  Exceeded: {workoutSets.filter(s => s.status === 'Exceeded').length}
                </span>
                <span className="bg-red-600 px-2 py-1 rounded">
                  Incomplete: {workoutSets.filter(s => s.status === 'Incomplete').length}
                </span>
              </div>
            </div>

            {/* Prescribed Exercises */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Prescribed Exercises</h3>
              {MemoizedExerciseList}
            </div>

            {/* Recorded Sets */}
            {workoutSets.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Recorded Sets</h3>
                {(() => {
                  const groupedSets = workoutSets.reduce((acc, set, index) => {
                    if (!acc[set.exercise_name]) acc[set.exercise_name] = []
                    acc[set.exercise_name].push({ ...set, originalIndex: index })
                    return acc
                  }, {})

                  return Object.entries(groupedSets).map(([exerciseName, sets]) => (
                    <div key={exerciseName} className="bg-slate-800 rounded-lg p-4">
                      <h4 className="font-semibold mb-3">{exerciseName}</h4>
                      <div className="space-y-2">
                        {sets.map((set) => (
                          <div key={set.originalIndex} className="bg-slate-700 rounded p-3">
                            {editingSet === set.originalIndex ? (
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
                                    onClick={() => {
                                      logSet(set.originalIndex, editWeight, editReps)
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
                              </div>
                            ) : (
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm">Set {set.set_number}</span>
                                  {set.logged ? (
                                    <>
                                      <span className="font-mono text-sm">
                                        {set.actual_weight}kg × {set.actual_reps} reps
                                      </span>
                                      <span className={`px-2 py-1 rounded text-xs ${
                                        set.status === 'Complete' ? 'bg-green-600' :
                                        set.status === 'Exceeded' ? 'bg-blue-600' : 'bg-red-600'
                                      }`}>
                                        {set.status}
                                      </span>
                                      {isLevelUpEligible(set.exercise_id) && (
                                        <span className="px-2 py-1 rounded text-xs bg-yellow-600 font-bold">
                                          🎉 Level Up Ready!
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex gap-2 items-center">
                                      <input
                                        type="number"
                                        step="0.25"
                                        placeholder={set.prescribed_weight.toString()}
                                        className="w-16 bg-slate-600 text-white px-2 py-1 rounded text-sm"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const weight = parseFloat(e.target.value) || set.prescribed_weight
                                            const repsInput = e.target.nextElementSibling.nextElementSibling
                                            const reps = parseInt(repsInput.value) || set.prescribed_reps
                                            logSet(set.originalIndex, weight, reps)
                                          }
                                        }}
                                      />
                                      <span className="text-slate-400">×</span>
                                      <input
                                        type="number"
                                        placeholder={set.prescribed_reps.toString()}
                                        className="w-16 bg-slate-600 text-white px-2 py-1 rounded text-sm"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const reps = parseInt(e.target.value) || set.prescribed_reps
                                            const weightInput = e.target.previousElementSibling.previousElementSibling
                                            const weight = parseFloat(weightInput.value) || set.prescribed_weight
                                            logSet(set.originalIndex, weight, reps)
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() => logSet(set.originalIndex, set.prescribed_weight, set.prescribed_reps)}
                                        className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs"
                                      >
                                        ✓
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {set.logged && (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => editRecordedSet(set, set.originalIndex)}
                                      className="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => deleteRecordedSet(set.originalIndex)}
                                      className="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}

            <button
              onClick={finishWorkout}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-xl"
            >
              Finish Workout
            </button>
          </div>
        )}

        {/* Cardio Dialog */}
        {showCardioDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Log Cardio Workout</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Exercise Type</label>
                  <input
                    type="text"
                    value={cardioType}
                    onChange={(e) => setCardioType(e.target.value)}
                    placeholder="e.g., Running, Cycling, Swimming"
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    value={cardioDuration}
                    onChange={(e) => setCardioDuration(parseInt(e.target.value) || 0)}
                    placeholder="30"
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is4x4"
                    checked={cardioIs4x4}
                    onChange={(e) => setCardioIs4x4(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="is4x4" className="text-sm">
                    This is a Norwegian 4x4 workout
                  </label>
                </div>

                {cardioIs4x4 && (
                  <div className="bg-slate-700 rounded p-3 text-sm text-blue-300">
                    4x4 Protocol: 4 min high intensity, 3 min recovery, repeat 4x
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={addCardioWorkout}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                >
                  Log Workout
                </button>
                <button
                  onClick={() => {
                    setShowCardioDialog(false)
                    setCardioType('')
                    setCardioDuration(0)
                    setCardioIs4x4(false)
                  }}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Set Dialog */}
        {showingCustomDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Add Custom Set</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={customWeight}
                    onChange={(e) => setCustomWeight(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Reps</label>
                  <input
                    type="number"
                    value={customReps}
                    onChange={(e) => setCustomReps(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={addCustomSet}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Add Set
                </button>
                <button
                  onClick={() => setShowingCustomDialog(false)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
                          
