'use client';

import { useState, useEffect } from 'react';
import { Commitment, CommitmentStatus } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusColors: Record<CommitmentStatus, string> = {
  open: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  in_progress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  canceled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  snoozed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const statusIcons: Record<CommitmentStatus, string> = {
  open: '○',
  in_progress: '◐',
  completed: '●',
  canceled: '✕',
  snoozed: '◑',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No due date';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due in ${days} days`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CommitmentCard({
  commitment,
  onResolve,
  onSnooze
}: {
  commitment: Commitment;
  onResolve: (id: string, type: string) => void;
  onSnooze: (id: string) => void;
}) {
  const isOverdue = commitment.due_at && new Date(commitment.due_at) < new Date() &&
    commitment.status !== 'completed' && commitment.status !== 'canceled';

  return (
    <div className={`p-4 rounded-lg border ${isOverdue ? 'border-red-500/50 bg-red-500/5' : 'border-white/10 bg-white/5'} hover:bg-white/10 transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs rounded border ${statusColors[commitment.status]}`}>
              {statusIcons[commitment.status]} {commitment.status.replace('_', ' ')}
            </span>
            {commitment.source_type === 'chat' && (
              <span className="text-xs text-gray-500">from chat</span>
            )}
          </div>
          <h3 className="font-medium text-white truncate">{commitment.title}</h3>
          {commitment.description && (
            <p className="text-sm text-gray-400 mt-1 line-clamp-2">{commitment.description}</p>
          )}
          <p className={`text-xs mt-2 ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            {formatDate(commitment.due_at)}
          </p>
        </div>
        {commitment.status !== 'completed' && commitment.status !== 'canceled' && (
          <div className="flex gap-1">
            <button
              onClick={() => onResolve(commitment.id, 'completed')}
              className="p-2 rounded hover:bg-green-500/20 text-green-400 transition-colors"
              title="Mark complete"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={() => onSnooze(commitment.id)}
              className="p-2 rounded hover:bg-purple-500/20 text-purple-400 transition-colors"
              title="Snooze 1 day"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CommitmentsPage() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CommitmentStatus | null>('open');
  const [stats, setStats] = useState<Record<CommitmentStatus, number>>({ open: 0, in_progress: 0, completed: 0, canceled: 0, snoozed: 0 });

  const fetchCommitments = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.set('status', statusFilter);
        if (statusFilter === 'completed' || statusFilter === 'canceled') {
          params.set('include_resolved', 'true');
        }
      } else {
        params.set('include_resolved', 'true');
      }

      const res = await fetch(`${API_URL}/api/commitments?${params}`);
      const data = await res.json();
      setCommitments(data.commitments || []);
    } catch (err) {
      console.error('Failed to fetch commitments:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/commitments/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchCommitments();
    fetchStats();
  }, [statusFilter]);

  const handleResolve = async (id: string, resolutionType: string) => {
    try {
      await fetch(`${API_URL}/api/commitments/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_type: resolutionType }),
      });
      fetchCommitments();
      fetchStats();
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  };

  const handleSnooze = async (id: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    try {
      await fetch(`${API_URL}/api/commitments/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snooze_until: tomorrow.toISOString() }),
      });
      fetchCommitments();
      fetchStats();
    } catch (err) {
      console.error('Failed to snooze:', err);
    }
  };

  const handleStatusClick = (status: CommitmentStatus) => {
    setStatusFilter(statusFilter === status ? null : status);
  };

  const totalCount = stats.open + stats.in_progress + stats.completed + stats.snoozed;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Commitments</h1>
          <p className="text-gray-400">Track your goals, tasks, and promises</p>
        </div>

        {/* Stats - Clickable Filters */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => handleStatusClick('open')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'open'
                ? 'bg-blue-500/30 border-blue-400 ring-2 ring-blue-400/50'
                : 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
            }`}
          >
            <div className="text-2xl font-bold text-blue-400">{stats.open}</div>
            <div className="text-xs text-gray-400">Open</div>
          </button>
          <button
            onClick={() => handleStatusClick('in_progress')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'in_progress'
                ? 'bg-yellow-500/30 border-yellow-400 ring-2 ring-yellow-400/50'
                : 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20'
            }`}
          >
            <div className="text-2xl font-bold text-yellow-400">{stats.in_progress}</div>
            <div className="text-xs text-gray-400">In Progress</div>
          </button>
          <button
            onClick={() => handleStatusClick('completed')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'completed'
                ? 'bg-green-500/30 border-green-400 ring-2 ring-green-400/50'
                : 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20'
            }`}
          >
            <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
            <div className="text-xs text-gray-400">Completed</div>
          </button>
          <button
            onClick={() => handleStatusClick('snoozed')}
            className={`p-3 rounded-lg border transition-all text-left ${
              statusFilter === 'snoozed'
                ? 'bg-purple-500/30 border-purple-400 ring-2 ring-purple-400/50'
                : 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20'
            }`}
          >
            <div className="text-2xl font-bold text-purple-400">{stats.snoozed}</div>
            <div className="text-xs text-gray-400">Snoozed</div>
          </button>
        </div>

        {/* Show All button when filtered */}
        {statusFilter && (
          <div className="mb-4">
            <button
              onClick={() => setStatusFilter(null)}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Show all ({totalCount})
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : commitments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-2">No commitments found</div>
            <p className="text-sm text-gray-600">
              Commitments are created automatically when you mention goals or tasks in chat
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {commitments.map((c) => (
              <CommitmentCard
                key={c.id}
                commitment={c}
                onResolve={handleResolve}
                onSnooze={handleSnooze}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
