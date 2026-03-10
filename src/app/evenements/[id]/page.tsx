"use client";
import { useParams } from "next/navigation";
import EventForm from "@/components/EventForm";
import { RequireRole } from "@/components/RequireRole";
export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  return <RequireRole allowedRoles={["admin", "direction"]}><EventForm eventId={id} /></RequireRole>;
}
