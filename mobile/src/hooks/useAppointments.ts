import { useEffect, useState } from "react";
import { getAvailableSlots } from "../services/appointmentService";

export function useAppointments(doctorId: string | null) {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doctorId) return;
    setLoading(true);
    getAvailableSlots(doctorId)
      .then(setSlots)
      .finally(() => setLoading(false));
  }, [doctorId]);

  return { slots, loading };
}
