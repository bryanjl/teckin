import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireHost } from '../../../../lib/server/host';
import { QuestionSetEditor } from '../question-set-editor';

export const metadata: Metadata = { title: 'Edit question set · Teckin' };

/** One of the host's sets in the editor. Sets of other organisations are simply not found. */
export default async function EditQuestionSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { setId } = await params;
  const { copied } = await searchParams;
  const host = await requireHost(`/dashboard/sets/${setId}`);
  if (!/^[0-9a-f-]{36}$/i.test(setId)) notFound();
  const set = await host.data.questionSets.get(setId);
  if (!set) notFound();

  return (
    <QuestionSetEditor
      questionSetId={set.id}
      title={set.title}
      description={set.description}
      questions={set.questions.map((question) => ({
        type: question.type,
        prompt: question.prompt,
        options: question.answerOptions.map((option) => ({
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      }))}
      loadedAt={set.updatedAt.toISOString()}
      justCopied={copied === '1'}
    />
  );
}
