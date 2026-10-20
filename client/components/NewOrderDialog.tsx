import * as React from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssignablePhotographer } from "@shared/adminOrderSchedule";

export const BLANK_NEW_ORDER = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  serviceNote: "",
  scheduledDate: "",
  scheduledTime: "",
  clientId: "",
  clientSearch: "",
  photographerKey: "",
};

export type NewOrderFormState = typeof BLANK_NEW_ORDER;

export interface NewOrderClient {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

const fieldClass = "w-full min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0d9488]/30";

export function NewOrderDialog({
  form,
  setForm,
  clients,
  photographers,
  warnings,
  saving,
  onClose,
  onCreate,
}: {
  form: NewOrderFormState;
  setForm: React.Dispatch<React.SetStateAction<NewOrderFormState>>;
  clients: NewOrderClient[];
  photographers: AssignablePhotographer[];
  warnings: string[];
  saving: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const [showClientMatches, setShowClientMatches] = React.useState(false);
  const clientMatches = form.clientSearch.trim().length > 1
    ? clients.filter((client) => {
      const haystack = `${client.firstName || ""} ${client.lastName || ""} ${client.email || ""}`.toLowerCase();
      return haystack.includes(form.clientSearch.trim().toLowerCase());
    }).slice(0, 6)
    : [];

  const selectClient = (client: NewOrderClient) => {
    setForm((prev) => ({
      ...prev,
      clientId: client.id,
      clientSearch: `${client.firstName || ""} ${client.lastName || ""}`.trim(),
      firstName: client.firstName || "",
      lastName: client.lastName || "",
      email: client.email || "",
      phone: client.phone || "",
    }));
    setShowClientMatches(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl p-5 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h3 className="text-sm font-black text-black uppercase tracking-widest">Create Order</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-5 h-5 text-gray-400 hover:text-black" />
          </button>
        </div>

        <div className="relative mb-3">
          <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Existing client</label>
          <input
            value={form.clientSearch}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, clientSearch: event.target.value, clientId: "" }));
              setShowClientMatches(true);
            }}
            onFocus={() => setShowClientMatches(true)}
            placeholder="Search Marty or an email to attach this order"
            className={fieldClass}
          />
          {showClientMatches && clientMatches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {clientMatches.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => selectClient(client)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm font-bold border-b border-gray-100 last:border-0"
                >
                  {`${client.firstName || ""} ${client.lastName || ""}`.trim() || "Client"}
                  <span className="text-gray-400 font-normal ml-2 text-xs break-all">{client.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">First Name *</label>
            <input value={form.firstName} onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))} className={fieldClass} />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Last Name</label>
            <input value={form.lastName} onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))} className={fieldClass} />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value, clientId: "" }))} className={fieldClass} />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} className={fieldClass} />
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Property Address</label>
            <input
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="123 Main St, Houston TX"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Service / Notes</label>
            <input
              value={form.serviceNote}
              onChange={(event) => setForm((prev) => ({ ...prev, serviceNote: event.target.value }))}
              placeholder="e.g. Listing Showcase + Aerial"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1" htmlFor="new-order-photographer">Photographer</label>
            <select
              id="new-order-photographer"
              data-testid="new-order-photographer"
              value={form.photographerKey}
              onChange={(event) => setForm((prev) => ({ ...prev, photographerKey: event.target.value }))}
              className={fieldClass}
            >
              <option value="">Unassigned</option>
              {photographers.map((person) => (
                <option key={person.key} value={person.key}>
                  {person.role === "apprentice" ? `${person.name} · Apprentice` : person.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1" htmlFor="new-order-date">Appointment date</label>
              <input
                id="new-order-date"
                data-testid="new-order-date"
                type="date"
                value={form.scheduledDate}
                onChange={(event) => setForm((prev) => ({ ...prev, scheduledDate: event.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1" htmlFor="new-order-time">Appointment time</label>
              <input
                id="new-order-time"
                data-testid="new-order-time"
                type="time"
                value={form.scheduledTime}
                onChange={(event) => setForm((prev) => ({ ...prev, scheduledTime: event.target.value }))}
                className={fieldClass}
              />
            </div>
          </div>
          {warnings.length > 0 && (
            <div data-testid="new-order-warning" role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 space-y-1">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <Button
            type="button"
            onClick={onCreate}
            disabled={saving}
            className="flex-1 bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-xl"
          >
            <Check className="w-4 h-4 mr-2" />
            {saving ? "Creating…" : "Create Order"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl font-bold">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
