import { useState, useEffect } from 'react'
import { Plus, Clock, CheckCircle, AlertCircle, ChevronRight, Calendar, Trash2 } from 'lucide-react'
import { useDataStore } from '../store/dataStore'
import { useAuthStore } from '../store/authStore'
import ContextHelpButton from './ContextHelpButton'
import { getContextHelp } from './helpContent'
import { Task, TaskPriority, TaskStatus } from '../types'

const TasksList = () => {
  const { tasks, fetchTasks, addTask, updateTask, completeTask, deleteTask } = useDataStore()
  const { user, agency } = useAuthStore()
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const filteredTasks = tasks.filter(task => {
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus
    const matchesPriority = filterPriority === 'all' || task.priority === filterPriority
    return matchesStatus && matchesPriority
  })

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    }
    const labels = {
      low: 'Niski',
      medium: 'Średni',
      high: 'Wysoki',
      urgent: 'Pilne'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[priority as keyof typeof styles]}`}>
        {labels[priority as keyof typeof labels]}
      </span>
    )
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      todo: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    const labels = {
      todo: 'Do zrobienia',
      in_progress: 'W trakcie',
      completed: 'Ukończone',
      cancelled: 'Anulowane'
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return

    const userId = user?.id
    const agencyId = agency?.id || user?.agencyId

    if (!userId || !agencyId) {
      setError('Brak kontekstu użytkownika lub agencji. Odśwież sesję i spróbuj ponownie.')
      return
    }

    try {
      setError('')
      await addTask({
        agencyId,
        assignedToId: userId,
        createdBy: userId,
        title: newTaskTitle.trim(),
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.TODO,
        dueDate: new Date().toISOString(),
        tags: []
      })
      setNewTaskTitle('')
      setShowModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać zadania')
    }
  }

  const handleComplete = async (taskId: string) => {
    try {
      setError('')
      await completeTask(taskId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zakończyć zadania')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    const confirmed = window.confirm('Czy na pewno chcesz usunąć to zadanie?')
    if (!confirmed) return
    try {
      setError('')
      await deleteTask(taskId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć zadania')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Dziś'
    if (diffDays === 1) return 'Jutro'
    if (diffDays === -1) return 'Wczoraj'
    if (diffDays < -1) return `${Math.abs(diffDays)} dni temu`
    return date.toLocaleDateString('pl-PL')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Zadania</h1>
          <p className="text-gray-600 dark:text-gray-400">Zarządzaj zadaniami i terminami</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap self-start">
          <ContextHelpButton help={getContextHelp('/zadania')} />
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary flex items-center gap-2 px-4 py-2 rounded-md transition-colors self-start"
          >
            <Plus size={20} />
            Nowe zadanie
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
        <div className="flex flex-col md:flex-row gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            title="Filtr statusu zadań"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
          >
            <option value="all">Wszystkie statusy</option>
            <option value="todo">Do zrobienia</option>
            <option value="in_progress">W trakcie</option>
            <option value="completed">Ukończone</option>
            <option value="cancelled">Anulowane</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            title="Filtr priorytetu zadań"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
          >
            <option value="all">Wszystkie priorytety</option>
            <option value="low">Niski</option>
            <option value="medium">Średni</option>
            <option value="high">Wysoki</option>
            <option value="urgent">Pilne</option>
          </select>
        </div>
      </div>

      {/* Tasks list */}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 transition-colors duration-200">
        {filteredTasks.map((task) => (
          <div key={task.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-4">
            <button
              onClick={() => handleComplete(task.id)}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                task.status === TaskStatus.COMPLETED
                  ? 'bg-green-500 border-green-500 text-white'
                  : task.dueDate && new Date(task.dueDate) < new Date()
                  ? 'border-red-300 dark:border-red-400'
                  : 'border-gray-300 dark:border-gray-500 hover:border-gray-400 dark:hover:border-gray-400'
              }`}
            >
              {task.status === TaskStatus.COMPLETED && <CheckCircle size={14} />}
            </button>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <p className="font-medium text-gray-800 dark:text-white truncate">{task.title}</p>
                {getPriorityBadge(task.priority)}
              </div>
              {task.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{task.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                {task.dueDate && (
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    {formatDate(task.dueDate)}
                  </span>
                )}
                {(Array.isArray(task.tags) ? task.tags : []).map((tag, idx) => (
                  <span key={idx} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs text-gray-800 dark:text-gray-200">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {getStatusBadge(task.status)}
              <button
                onClick={() => void handleDeleteTask(task.id)}
                className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                title="Usuń zadanie"
              >
                <Trash2 size={14} />
              </button>
              <ChevronRight className="text-gray-400 dark:text-gray-500" size={16} />
            </div>
          </div>
        ))}

        {filteredTasks.length === 0 && (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Clock size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p>Brak zadań</p>
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-6 transition-colors duration-200">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Nowe zadanie</h2>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Tytuł zadania..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-colors duration-200"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddTask}
                className="flex-1 btn-primary py-2 rounded-md transition-colors"
              >
                Dodaj
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 dark:border-gray-600 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition-colors duration-200"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TasksList