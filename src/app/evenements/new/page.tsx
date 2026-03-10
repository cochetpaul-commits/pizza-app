"use client";
import EventForm from "@/components/EventForm";
import { RequireRole } from "@/components/RequireRole";
export default function NewEventPage() {
  return <RequireRole allowedRoles={["admin", "direction"]}><EventForm /></RequireRole>;
}
