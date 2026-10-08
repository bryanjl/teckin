import type { Metadata } from 'next';
import { requireHost } from '../../../../lib/server/host';
import { QuestionSetEditor } from '../question-set-editor';

export const metadata: Metadata = { title: 'New question set · Teckin' };

/** A blank set in the editor; `?import=1` opens the CSV import straight away. */
export default async function NewQuestionSetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireHost('/dashboard/sets/new');
  const { import: startWithImport } = await searchParams;
  return (
    <QuestionSetEditor
      questionSetId={null}
      title=""
      description=""
      questions={[]}
      loadedAt={null}
      startWithImport={startWithImport === '1'}
    />
  );
}
