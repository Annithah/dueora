import { toISODate } from '@/lib/dates';
import { toast } from '@/components/ui';
import { permissionState } from '@/features/notifications/push';
import { ObligationForm, afterSave } from '@/features/obligations/ObligationForm';

export default function NewPayment() {
  return (
    <ObligationForm
      today={toISODate(new Date())}
      onSaved={async (saved, isFirst) => {
        toast.success('Payment added', `We’ll keep watch on ${saved.name}.`);
        afterSave(saved, isFirst, await permissionState().catch(() => 'denied' as const));
      }}
    />
  );
}
