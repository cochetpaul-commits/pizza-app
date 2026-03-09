"use client";
import { useParams } from "next/navigation";
import EventForm from "@/components/EventForm";
export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  return <EventForm eventId={id} />;
}
