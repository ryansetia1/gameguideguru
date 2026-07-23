import { AdminDataProvider } from "@/app/admin/admin-data-provider";
import { AdminStyles } from "@/app/admin/admin-styles";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminDataProvider>
      {children}
      <AdminStyles />
    </AdminDataProvider>
  );
}
