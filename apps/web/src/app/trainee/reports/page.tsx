import type { Metadata } from 'next';
import { TraineeReportView } from '@/features/reports';

export const metadata: Metadata = {
  title: 'My Reports | Trainee Portal',
  description: 'View published training evaluation reports and performance summaries.',
};

export default function TraineeReportsPage() {
  return <TraineeReportView />;
}
