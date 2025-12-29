'use client';

import { useState } from 'react';
import type { ResolutionCandidate, ResolutionType, Commitment } from '@/lib/types';

// Inline SVG icons
const CheckIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ChevronDownIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const ClockIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertCircleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

interface ResolutionConfirmationProps {
  candidate: ResolutionCandidate;
  onConfirm: (commitmentId: string, resolutionType: ResolutionType) => Promise<void>;
  onDismiss: (commitmentId: string) => void;
  compact?: boolean;
}

const resolutionTypeLabels: Record<ResolutionType, string> = {
  completed: 'Completed',
  canceled: 'Canceled',
  no_longer_relevant: 'No Longer Relevant',
  superseded: 'Superseded',
};

const confidenceColors = {
  high: 'text-emerald-400',
  medium: 'text-amber-400',
  low: 'text-red-400',
};

function CommitmentCard({
  commitment,
  confidence,
  similarity,
  isSelected,
  onClick,
}: {
  commitment: Commitment;
  confidence: 'high' | 'medium' | 'low';
  similarity: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? 'border-purple-500 bg-purple-500/10'
          : 'border-white/10 hover:border-white/20 bg-white/5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate">{commitment.title}</h4>
          {commitment.description && (
            <p className="text-sm text-white/60 mt-1 line-clamp-2">
              {commitment.description}
            </p>
          )}
          {commitment.due_at && (
            <div className="flex items-center gap-1 mt-2 text-xs text-white/50">
              <ClockIcon className="w-3 h-3" />
              <span>Due: {new Date(commitment.due_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-xs font-medium ${confidenceColors[confidence]}`}>
            {Math.round(similarity * 100)}% match
          </span>
          {isSelected && (
            <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
              <CheckIcon className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function ResolutionConfirmation({
  candidate,
  onConfirm,
  onDismiss,
  compact = false,
}: ResolutionConfirmationProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [selectedCommitmentId, setSelectedCommitmentId] = useState<string | null>(
    candidate.best_match?.commitment.id ?? null
  );
  const [resolutionType, setResolutionType] = useState<ResolutionType>(
    candidate.detection.resolution_type ?? 'completed'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selectedCommitmentId) return;
    setIsSubmitting(true);
    try {
      await onConfirm(selectedCommitmentId, resolutionType);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (selectedCommitmentId) {
      onDismiss(selectedCommitmentId);
    }
  };

  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 transition-colors"
      >
        <AlertCircleIcon className="w-4 h-4 text-purple-400" />
        <span className="text-sm text-purple-300 flex-1 text-left">
          Detected resolution: &quot;{candidate.detection.subject_hint}&quot;
        </span>
        <ChevronDownIcon className="w-4 h-4 text-purple-400" />
      </button>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-purple-500/30 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-purple-500/10 border-b border-purple-500/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircleIcon className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-300">
                Resolution Detected
              </span>
              <span className={`text-xs ${confidenceColors[candidate.detection.confidence]}`}>
                ({candidate.detection.confidence} confidence)
              </span>
            </div>
            <p className="text-sm text-white/70 italic">
              &quot;{candidate.message_content}&quot;
            </p>
          </div>
          {compact && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-1 hover:bg-white/10 rounded"
            >
              <ChevronUpIcon className="w-4 h-4 text-white/50" />
            </button>
          )}
        </div>
      </div>

      {/* Matching Commitments */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-white/60">
          {candidate.matches.length === 1
            ? 'Did you complete this commitment?'
            : 'Which commitment did you complete?'}
        </p>

        <div className="space-y-2">
          {candidate.matches.map((match) => (
            <CommitmentCard
              key={match.commitment.id}
              commitment={match.commitment}
              confidence={match.confidence}
              similarity={match.similarity}
              isSelected={selectedCommitmentId === match.commitment.id}
              onClick={() => setSelectedCommitmentId(match.commitment.id)}
            />
          ))}
        </div>

        {/* Resolution Type Selector */}
        {selectedCommitmentId && (
          <div className="mt-4">
            <label className="block text-sm text-white/60 mb-2">
              Resolution type:
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(resolutionTypeLabels) as ResolutionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setResolutionType(type)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    resolutionType === type
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                      : 'border-white/10 text-white/60 hover:border-white/20'
                  }`}
                >
                  {resolutionTypeLabels[type]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-white/10 flex gap-2 justify-end">
        <button
          type="button"
          onClick={handleDismiss}
          className="px-4 py-2 text-sm text-white/60 hover:text-white/80 transition-colors"
        >
          <XIcon className="w-4 h-4 inline mr-1" />
          Not a resolution
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedCommitmentId || isSubmitting}
          className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Confirming...
            </>
          ) : (
            <>
              <CheckIcon className="w-4 h-4" />
              Confirm
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Container for multiple resolution confirmations
 */
export function ResolutionConfirmationList({
  candidates,
  onConfirm,
  onDismiss,
}: {
  candidates: ResolutionCandidate[];
  onConfirm: (commitmentId: string, resolutionType: ResolutionType) => Promise<void>;
  onDismiss: (commitmentId: string) => void;
}) {
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

  const handleConfirm = async (commitmentId: string, resolutionType: ResolutionType) => {
    await onConfirm(commitmentId, resolutionType);
    setConfirmedIds((prev) => new Set([...prev, commitmentId]));
  };

  const pendingCandidates = candidates.filter(
    (c) => c.best_match && !confirmedIds.has(c.best_match.commitment.id)
  );

  if (pendingCandidates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {pendingCandidates.map((candidate, index) => (
        <ResolutionConfirmation
          key={candidate.best_match?.commitment.id ?? index}
          candidate={candidate}
          onConfirm={handleConfirm}
          onDismiss={onDismiss}
          compact={pendingCandidates.length > 1}
        />
      ))}
    </div>
  );
}
