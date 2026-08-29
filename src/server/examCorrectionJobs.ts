export type ExamCorrectionJobStage =
  | 'preparing'
  | 'reading_exam'
  | 'reading_answer_key'
  | 'grading'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface ExamCorrectionPageState {
  page_kind: 'exam' | 'answer_key';
  page_number: number;
  status: 'pending' | 'reading' | 'ready' | 'failed';
  transcription?: string;
  error_message?: string | null;
}

export function correctionProgress(
  pages: ExamCorrectionPageState[],
  status: string,
): { progress: number; stage: ExamCorrectionJobStage } {
  if (status === 'completed') return { progress: 100, stage: 'completed' };
  if (status === 'failed') return { progress: Math.max(1, readingProgress(pages)), stage: 'failed' };
  const examPages = pages.filter((page) => page.page_kind === 'exam');
  const answerKeyPages = pages.filter((page) => page.page_kind === 'answer_key');
  const readyExam = examPages.filter((page) => page.status === 'ready').length;
  const readyAnswerKey = answerKeyPages.filter((page) => page.status === 'ready').length;

  if (readyExam < examPages.length) {
    const ratio = examPages.length ? readyExam / examPages.length : 1;
    return { progress: Math.round(5 + ratio * 50), stage: 'reading_exam' };
  }
  if (readyAnswerKey < answerKeyPages.length) {
    const ratio = answerKeyPages.length ? readyAnswerKey / answerKeyPages.length : 1;
    return { progress: Math.round(55 + ratio * 15), stage: 'reading_answer_key' };
  }
  if (status === 'grading') return { progress: 82, stage: 'grading' };
  if (status === 'finalizing') return { progress: 95, stage: 'finalizing' };
  return { progress: 70, stage: 'grading' };
}

function readingProgress(pages: ExamCorrectionPageState[]): number {
  if (!pages.length) return 5;
  return Math.round(5 + (pages.filter((page) => page.status === 'ready').length / pages.length) * 65);
}

export function orderedTranscription(
  pages: ExamCorrectionPageState[],
  kind: 'exam' | 'answer_key',
): string {
  return pages
    .filter((page) => page.page_kind === kind && page.status === 'ready')
    .sort((a, b) => a.page_number - b.page_number)
    .map((page) => String(page.transcription || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

export async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
