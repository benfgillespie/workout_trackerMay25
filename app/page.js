'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function WorkoutTracker() {
  const [exercises, setExercises] = useState([])
  const [userWeights, setUserWeights] = useState({})
  const [currentWorkout, setCurrentWorkout] = useState(null)
  const [workoutSets, setWorkoutSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showWeightManager, setShowWeightManager] = useState(false)
  const [currentCycle, setCurrentCycle] = useState({ week: 1, day: 'Light', cycle: 1 })
  const [recentWorkouts, setRecentWorkouts] = useState([])
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
  const [showCardioDialog, setShowCardioDialog] = useState(false)
  const [cardioType, setCardioType] = useState('')
  const [cardioDuration, setCardioDuration] = useState(0)
  const [cardioIs4x4, setCardioIs4x4] = useState(false)
  const [recentCardio, setRecentCardio] = useState([])
  const [next4x4Date, setNext4x4Date] = useState(null)
  const [missed4x4Count, setMissed4x4Count] = useState(0)
  const [zone2Minutes, setZone2Minutes] = useState(0)

  // Load initial data
  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      // Load exercises
      const { data: exercisesData } = await supabase
        .from('exercises')
        .select('*')
        .order('name')

      // Load user weights
      const { data: weightsData } = await supabase
        .from('user_exercise_weights')
        .select('exercise_id, prescribed_weight')

      // Load current cycle progress
      const { data: lastSession } = await supabase
        .from('workout_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)

      // Load recent workouts (last 3 completed)
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
        .order('created_at', { ascending: false })
        .limit(3)

      setExercises(exercisesData || [])
      
      const weightsMap = {}
      weightsData?.forEach(w => {
        weightsMap[w.exercise_id] = w.prescribed_weight
      })
      setUserWeights(weightsMap)

      // Calculate current cycle position
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
      
      // Load cardio data
      await loadCardioData()

      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }

  const loadCardioData = async () => {
    try {
      // Load recent cardio sessions
      const { data: cardioData } = await supabase
        .from('cardio_sessions')
        .select('*')
        .order('workout_date', { ascending: false })
        .limit(5)

      setRecentCardio(cardioData || [])

      // Calculate next 4x4 date and missed count
      const today = new Date()
      const currentSunday = getNextSunday(today)
      
      // Find last 4x4 workout
      const { data: last4x4 } = await supabase
        .from('cardio_sessions')
        .select('workout_date')
        .eq('is_4x4', true)
        .order('workout_date', { ascending: false })
        .limit(1)

      let nextDueDate = currentSunday
      if (last4x4 && last4x4.length > 0) {
        const lastDate = new Date(last4x4[0].workout_date)
        const lastSunday = getNextSunday(lastDate)
        nextDueDate = new Date(lastSunday)
        nextDueDate.setDate(nextDueDate.getDate() + 7) // Next week
      }

      setNext4x4Date(nextDueDate)

      // Calculate missed 4x4s in last 12 weeks
      const twelveWeeksAgo = new Date()
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - (12 * 7))
      
      const { data: recent4x4s } = await supabase
        .from('cardio_sessions')
        .select('workout_date')
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

      // Calculate Zone 2 minutes in last 7 days (all cardio EXCEPT 4x4 sessions)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const { data: recentCardioForZone2 } = await supabase
        .from('cardio_sessions')
        .select('duration_minutes, is_4x4')
        .gte('workout_date', sevenDaysAgo.toISOString().split('T')[0])

      const totalZone2Minutes = recentCardioForZone2?.reduce((sum, session) => {
        // Only count as Zone 2 if it's NOT a 4x4 session
        return session.is_4x4 ? sum : sum + session.duration_minutes
      }, 0) || 0
      
      setZone2Minutes(totalZone2Minutes)

    } catch (error) {
      console.error('Error loading cardio data:', error)
    }
  }

  const getNextSunday = (date) => {
    const result = new Date(date)
    result.setDate(result.getDate() + (7 - result.getDay()) % 7)
    return result
  }

  const getWeekStart = (date) => {
    const result = new Date(date)
    result.setDate(result.getDate() - result.getDay()) // Go to Sunday
    return result
  }

  const addCardioWorkout = async () => {
    if (!cardioType.trim() || cardioDuration <= 0) {
      alert('Please enter exercise type and duration')
      return
    }

    try {
      await supabase
        .from('cardio_sessions')
        .insert({
          workout_date: new Date().toISOString().split('T')[0],
          exercise_type: cardioType,
          duration_minutes: cardioDuration,
          is_4x4: cardioIs4x4
        })

      // Reset form
      setCardioType('')
      setCardioDuration(0)
      setCardioIs4x4(false)
      setShowCardioDialog(false)
      setCardioDuration(0)
      setCardioIs4x4(false)
      setShowCardioDialog(false)

      // Refresh data
      loadCardioData()

      const message = `Cardio workout logged: ${cardioType} for ${cardioDuration} minutes${cardioIs4x4 ? ' (Norwegian 4x4)' : ''}`
      alert(message)

    } catch (error) {
      console.error('Error adding cardio workout:', error)
      alert('Failed to log cardio workout')
    }
  }

  const getNextDay = (currentDay) => {
    const dayOrder = ['Light', 'Medium', 'Heavy']
    const currentIndex = dayOrder.indexOf(currentDay)
    return dayOrder[(currentIndex + 1) % dayOrder.length]
  }

  const calculateWorkoutWeight = (prescribedWeight, dayType) => {
    const multipliers = { Light: 0.8, Medium: 0.9, Heavy: 1.0 }
    return Math.round(prescribedWeight * multipliers[dayType] * 4) / 4 // Round to nearest 0.25kg
  }

  const getRepsForWeek = (week) => {
    return 6 + week + 1 // Week 1 = 8 reps, Week 2 = 9 reps, etc.
  }

  const startWorkout = async () => {
    try {
      // Create workout session
      const { data: session, error } = await supabase
        .from('workout_sessions')
        .insert({
          workout_date: new Date().toISOString().split('T')[0],
          week_number: currentCycle.week,
          day_type: currentCycle.day,
          cycle_number: currentCycle.cycle
        })
        .select()
        .single()

      if (error) throw error

      setCurrentWorkout(session)
      setIsEditingCompletedWorkout(false) // This is a new workout

      // Generate workout sets
      const sets = []
      exercises.forEach(exercise => {
        const prescribedWeight = userWeights[exercise.id] || 0
        const workoutWeight = calculateWorkoutWeight(prescribedWeight, currentCycle.day)
        const reps = getRepsForWeek(currentCycle.week)

        // Create 2 sets per exercise
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
        // Update existing set
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
        // Insert new set
        const { data: newSet } = await supabase
          .from('workout_sets')
          .insert({
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

      // Update local state
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

      // Check for level up (Week 5, Heavy day, both sets complete)
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
      // Level up! Increase weight by 10%
      const currentWeight = userWeights[exerciseId]
      const newWeight = Math.round(currentWeight * 1.1 * 4) / 4 // Round to nearest 0.25kg

      try {
        await supabase
          .from('user_exercise_weights')
          .update({ prescribed_weight: newWeight, updated_at: new Date().toISOString() })
          .eq('exercise_id', exerciseId)

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
    loadData() // Refresh cycle position only for new workouts
  }

  const exitWorkout = () => {
    if (isEditingCompletedWorkout) {
      // For completed workouts, just ask about discarding changes
      if (confirm('Discard changes and return to workout history?')) {
        setCurrentWorkout(null)
        setWorkoutSets([])
        setIsEditingCompletedWorkout(false)
        loadData() // Refresh to show updated history
      }
    } else {
      // For new workouts, preserve the original behavior
      if (confirm('Are you sure you want to exit this workout? Your progress will be saved but the workout will remain incomplete.')) {
        setCurrentWorkout(null)
        setWorkoutSets([])
        setIsEditingCompletedWorkout(false)
        // Don't refresh cycle position - stay on same workout for next time
      }
    }
  }

  const updateWeight = async (exerciseId, newWeight) => {
    try {
      await supabase
        .from('user_exercise_weights')
        .update({ prescribed_weight: newWeight })
        .eq('exercise_id', exerciseId)

      setUserWeights(prev => ({
        ...prev,
        [exerciseId]: newWeight
      }))
    } catch (error) {
      console.error('Error updating weight:', error)
    }
  }

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
        .order('exercise_id', { ascending: true })
        .order('set_number', { ascending: true })
      
      setWorkoutDetails(setsData || [])
      setSelectedWorkout(workout)
    } catch (error) {
      console.error('Error loading workout details:', error)
    }
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
    // Only eligible on Week 5, Heavy day
    if (currentCycle.week !== 5 || currentCycle.day !== 'Heavy') {
      return false
    }
    
    const exerciseSets = sets.filter(s => s.exercise_id === exerciseId && s.logged)
    const completedSets = exerciseSets.filter(s => s.status === 'Complete' || s.status === 'Exceeded')
    
    return completedSets.length >= 2
  }

  const deleteWorkout = async (workoutId) => {
    if (!confirm('Are you sure you want to delete this workout? This action cannot be undone.')) {
      return
    }

    try {
      // Delete all sets first (due to foreign key constraint)
      await supabase
        .from('workout_sets')
        .delete()
        .eq('session_id', workoutId)

      // Then delete the workout session
      await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', workoutId)

      // Refresh data
      loadData()
      if (showAllWorkouts) {
        loadAllWorkouts()
      }
      
      // Go back to main view if we were viewing this workout
      if (selectedWorkout?.id === workoutId) {
        setSelectedWorkout(null)
      }

      alert('Workout deleted successfully!')
    } catch (error) {
      console.error('Error deleting workout:', error)
      alert('Failed to delete workout. Please try again.')
    }
  }

  const startEditSet = (set) => {
    setEditingSet(set.id)
    setEditWeight(set.actual_weight)
    setEditReps(set.actual_reps)
  }

  const saveEditSet = async (setId) => {
    try {
      // Calculate new status
      const set = workoutDetails.find(s => s.id === setId)
      let newStatus = 'Incomplete'
      
      if (editReps >= set.prescribed_reps && editWeight >= set.prescribed_weight) {
        newStatus = editReps > set.prescribed_reps || editWeight > set.prescribed_weight ? 'Exceeded' : 'Complete'
      }

      // Update in database
      await supabase
        .from('workout_sets')
        .update({
          actual_weight: editWeight,
          actual_reps: editReps,
          status: newStatus
        })
        .eq('id', setId)

      // Update local state
      setWorkoutDetails(prev => prev.map(s => 
        s.id === setId 
          ? { ...s, actual_weight: editWeight, actual_reps: editReps, status: newStatus }
          : s
      ))

      setEditingSet(null)
      
      // Refresh workout data
      loadData()
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

      // Update local state
      setWorkoutDetails(prev => prev.filter(s => s.id !== setId))
      
      // Refresh workout data
      loadData()
      if (showAllWorkouts) {
        loadAllWorkouts()
      }

    } catch (error) {
      console.error('Error deleting set:', error)
      alert('Failed to delete set. Please try again.')
    }
  }

  const editWorkout = async (workout) => {
    try {
      // Set the current workout to this historical workout
      setCurrentWorkout(workout)
      setIsEditingCompletedWorkout(true) // Mark as editing a completed workout
      
      // Load the existing sets for this workout
      const { data: existingSets } = await supabase
        .from('workout_sets')
        .select(`
          *,
          exercises (name)
        `)
        .eq('session_id', workout.id)
        .order('exercise_id')
        .order('set_number')

      // Convert existing sets to the workout format
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
        set_id: set.id // Keep track of existing set ID for updates
      }))

      // Generate any missing sets for exercises that weren't in the original workout
      const existingExerciseIds = new Set(existingSets.map(s => s.exercise_id))
      const reps = getRepsForWeek(workout.week_number)
      
      exercises.forEach(exercise => {
        if (!existingExerciseIds.has(exercise.id)) {
          const prescribedWeight = userWeights[exercise.id] || 0
          const workoutWeight = calculateWorkoutWeight(prescribedWeight, workout.day_type)
          
          // Add 2 sets for this exercise
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

      // Sort sets by exercise name and set number
      convertedSets.sort((a, b) => {
        if (a.exercise_name !== b.exercise_name) {
          return a.exercise_name.localeCompare(b.exercise_name)
        }
        return a.set_number - b.set_number
      })

      setWorkoutSets(convertedSets)
      
      // Update the current cycle to match this workout
      setCurrentCycle({
        week: workout.week_number,
        day: workout.day_type,
        cycle: workout.cycle_number
      })

      // Clear the selected workout to go to active workout view
      setSelectedWorkout(null)
      
    } catch (error) {
      console.error('Error editing workout:', error)
      alert('Failed to load workout for editing. Please try again.')
    }
  }

  const addPrescribedSet = async (exerciseId, weight, reps) => {
    try {
      const exercise = exercises.find(e => e.id === exerciseId)
      const nextSetNumber = getNextSetNumber(exerciseId)
      
      const { data: newSet } = await supabase
        .from('workout_sets')
        .insert({
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

      // Add to local state
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

      // Check for level up
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

      // Add to local state
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

      // Check for level up
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 p-4 shadow-lg">
        <h1 className="text-2xl font-bold text-center">Workout Tracker</h1>
        <div className="text-center text-slate-300 mt-2">
          Week {currentCycle.week} • {currentCycle.day} Day • Cycle {currentCycle.cycle}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4">
        {selectedWorkout ? (
          /* Workout Details View */
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
                  // Group sets by exercise
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
                              // Editing mode
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
                              // View mode
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
                                    // Check if this exercise has level up for this workout
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
          /* All Workouts View */
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
          /* Home Page */
          <div className="space-y-4">
            {/* Strength Workout Section */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">💪 Strength Training</h3>
              
              {/* Start Workout Button */}
              <button
                onClick={startWorkout}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-xl mb-4"
              >
                Start Today's Workout
              </button>

              {/* Current Workout Preview */}
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

            {/* Cardio Section */}
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-green-400">🏃 Cardio Training</h3>
              
              <button
                onClick={() => setShowCardioDialog(true)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg mb-3"
              >
                Log Cardio Workout
              </button>

              {/* Norwegian 4x4 Status */}
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

              {/* Zone 2 Status */}
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

              {/* Recent Cardio */}
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

            {/* Weight Management */}
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

            {/* Recent Workouts */}
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
          /* Active Workout */
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

            {/* Recorded Sets */}
            {workoutSets.filter(set => set.logged).length > 0 && (
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3">Recorded Sets</h3>
                <div className="space-y-2">
                  {workoutSets
                    .filter(set => set.logged)
                    .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name))
                    .map((set, index) => (
                    <div key={set.set_id || index} className="flex items-center justify-between bg-slate-700 rounded p-3">
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exercise List - One row per exercise */}
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

            {/* Action Buttons */}
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

// Set Logger Component
function SetLogger({ set, onLog }) {
  const [weight, setWeight] = useState(set.prescribed_weight)
  const [reps, setReps] = useState(set.prescribed_reps)
  const [showCustom, setShowCustom] = useState(false)

  const getStatusColor = (status) => {
    switch (status) {
      case 'Complete': return 'bg-green-600'
      case 'Exceeded': return 'bg-blue-600'
      case 'Incomplete': return 'bg-red-600'
      default: return 'bg-slate-600'
    }
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold">{set.exercise_name}</h4>
        <span className="text-sm text-slate-300">Set {set.set_number}</span>
      </div>
      
      <div className="text-sm text-slate-300 mb-3">
        Target: {set.prescribed_weight}kg × {set.prescribed_reps} reps
      </div>

      {set.logged ? (
        <div className={`p-3 rounded ${getStatusColor(set.status)} text-center`}>
          <div className="font-semibold">{set.status}</div>
          <div className="text-sm">{set.actual_weight}kg × {set.actual_reps} reps</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => onLog(set.prescribed_weight, set.prescribed_reps)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
            >
              Log as Prescribed
            </button>
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="flex-1 bg-slate-600 hover:bg-slate-500 py-2 px-4 rounded"
            >
              Custom
            </button>
          </div>

          {showCustom && (
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="0.25"
                value={weight}
                onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-slate-700 text-white px-3 py-2 rounded"
                placeholder="Weight (kg)"
              />
              <input
                type="number"
                value={reps}
                onChange={(e) => setReps(parseInt(e.target.value) || 0)}
                className="flex-1 bg-slate-700 text-white px-3 py-2 rounded"
                placeholder="Reps"
              />
              <button
                onClick={() => onLog(weight, reps)}
                className="bg-green-600 hover:bg-green-700 py-2 px-4 rounded"
              >
                Log
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}