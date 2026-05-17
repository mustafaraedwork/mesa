import { redirect } from 'next/navigation';

export default function TenantDashboardIndex() {
  redirect('/admin/dashboard/menu');
}
