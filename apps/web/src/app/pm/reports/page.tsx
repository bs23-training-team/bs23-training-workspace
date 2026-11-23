import type { Metadata } from 'next';
import { PmReportView } from '@/features/reports';

export const metadata: Metadata = {
  title: 'Evaluation Reports | PM Dashboard',
  description: 'Manage, edit, publish and export training period evaluation reports.',
};

export default function PmReportsPage() {
  return <PmReportView />;
}
