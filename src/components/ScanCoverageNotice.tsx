import type { Report } from '../../shared/types';
import { scanCoverageFeedback } from './scanFeedback';

export function ScanCoverageNotice({ report }: { report: Report }) {
  const feedback = scanCoverageFeedback(report);
  if (!feedback) return null;
  return <section className="scan-coverage" aria-label="Scan coverage">
    <p><strong>{feedback.title}</strong></p>
    {feedback.details.map(detail => <p key={detail}>{detail}</p>)}
  </section>;
}
