import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const ORDER_STATUSES = ["pending", "in_progress", "trial", "ready", "delivered", "cancelled"];

async function api(path, options = {}, token = "") {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function emptyCustomerForm() {
  return { name: "", phone: "", email: "" };
}

function emptyMeasurementForm() {
  return {
    neck: "",
    chest: "",
    waist: "",
    hip: "",
    shoulder: "",
    sleeve: "",
    length: "",
    inseam: "",
    notes: ""
  };
}

function emptyOrderDraft() {
  return {
    garment_type: "Shirt",
    status: "pending",
    total_amount: "",
    advance_paid: "",
    due_date: "",
    notes: ""
  };
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("td_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("td_user");
    return raw ? JSON.parse(raw) : null;
  });

  const [email, setEmail] = useState("admin@tailordesk.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [measurementForm, setMeasurementForm] = useState(emptyMeasurementForm);
  const [measurementCreatesOrder, setMeasurementCreatesOrder] = useState(true);
  const [measurementOrderDraft, setMeasurementOrderDraft] = useState(emptyOrderDraft);
  const [orderForm, setOrderForm] = useState(emptyOrderDraft);
  const [orderUseLatestMeasurement, setOrderUseLatestMeasurement] = useState(true);
  const [paymentDraft, setPaymentDraft] = useState({});
  const [statusDraft, setStatusDraft] = useState({});
  const [leftPanelMode, setLeftPanelMode] = useState("search");
  const [searchQuery, setSearchQuery] = useState("");

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!token) return;
    loadSession();
  }, [token]);

  const selectedCustomer = useMemo(
    () => customers.find((item) => item.id === selectedId) || null,
    [customers, selectedId]
  );

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return customers;
    }
    return customers.filter((customer) => {
      const byName = String(customer.name || "").toLowerCase().includes(query);
      const byPhone = String(customer.phone || "").toLowerCase().includes(query);
      return byName || byPhone;
    });
  }, [customers, searchQuery]);

  async function loadSession() {
    try {
      setLoading(true);
      const me = await api("/api/auth/me", {}, token);
      setUser(me.user);
      localStorage.setItem("td_user", JSON.stringify(me.user));
      await loadCustomers();
    } catch (err) {
      setError(err.message);
      logout();
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomers(preferredId) {
    const list = await api("/api/customers", {}, token);
    setCustomers(list);

    const targetId = preferredId || selectedId || list[0]?.id || null;
    setSelectedId(targetId);

    if (targetId) {
      await loadCustomerDetail(targetId);
    } else {
      setDetail(null);
    }
  }

  async function loadCustomerDetail(customerId) {
    if (!customerId) return;
    const data = await api(`/api/customers/${customerId}`, {}, token);
    setDetail(data);
  }

  async function refreshSelected() {
    await loadCustomers(selectedId);
  }

  async function handleLogin(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("td_token", data.token);
      localStorage.setItem("td_user", JSON.stringify(data.user));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken("");
    setUser(null);
    setCustomers([]);
    setSelectedId(null);
    setDetail(null);
    localStorage.removeItem("td_token");
    localStorage.removeItem("td_user");
  }

  async function createCustomer(event) {
    event.preventDefault();
    try {
      setError("");
      await api(
        "/api/customers",
        { method: "POST", body: JSON.stringify(customerForm) },
        token
      );
      setCustomerForm(emptyCustomerForm);
      await loadCustomers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addMeasurement(event) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      setError("");
      await api(
        `/api/customers/${selectedId}/measurements`,
        {
          method: "POST",
          body: JSON.stringify({
            ...measurementForm,
            create_order: measurementCreatesOrder,
            order: measurementCreatesOrder ? measurementOrderDraft : undefined
          })
        },
        token
      );
      setMeasurementForm(emptyMeasurementForm);
      await refreshSelected();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createOrder(event) {
    event.preventDefault();
    if (!selectedId) return;
    try {
      setError("");
      await api(
        "/api/orders",
        {
          method: "POST",
          body: JSON.stringify({
            ...orderForm,
            customer_id: selectedId,
            use_latest_measurement: orderUseLatestMeasurement
          })
        },
        token
      );
      setOrderForm(emptyOrderDraft);
      await refreshSelected();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateOrderStatus(orderId, currentStatus) {
    const nextStatus = statusDraft[orderId] || currentStatus;
    try {
      setError("");
      await api(
        `/api/orders/${orderId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: nextStatus,
            status_note: "Updated from dashboard"
          })
        },
        token
      );
      await refreshSelected();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addPayment(orderId) {
    const amount = paymentDraft[orderId];
    if (!amount) return;
    try {
      setError("");
      await api(
        `/api/orders/${orderId}/payments`,
        { method: "POST", body: JSON.stringify({ amount, method: "cash" }) },
        token
      );
      setPaymentDraft((prev) => ({ ...prev, [orderId]: "" }));
      await refreshSelected();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-10">
        <section className="grid w-full overflow-hidden rounded-3xl bg-white shadow-panel lg:grid-cols-2">
          <div className="bg-brand-900 p-10 text-clay">
            <p className="text-sm uppercase tracking-[0.3em] text-brand-100">TailorDesk</p>
            <h1 className="mt-4 font-display text-4xl leading-tight">
              Client history, measurements, and payments in one panel.
            </h1>
            <p className="mt-4 max-w-sm text-sm text-brand-100">
              Admins can edit records. Normal users can securely view all customer history.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4 p-10">
            <h2 className="font-display text-3xl text-ink">Sign in</h2>
            <label className="block text-sm font-semibold text-ink">
              Email
              <input
                className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Password
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
            <button
              disabled={loading}
              className="w-full rounded-xl bg-brand-700 px-4 py-2 font-semibold text-white transition hover:bg-brand-900 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-panel">
        <div>
          <h1 className="font-display text-3xl text-ink">TailorDesk</h1>
          <p className="text-sm text-slate-600">Signed in as {user?.name} ({user?.role})</p>
        </div>
        <button onClick={logout} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
          Logout
        </button>
      </header>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 rounded-2xl bg-white p-4 shadow-panel">
          <div className="space-y-2">
            <h2 className="font-display text-2xl">Customers</h2>
            <div className="grid grid-cols-2 gap-2">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setLeftPanelMode("add")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    leftPanelMode === "add"
                      ? "bg-brand-700 text-white"
                      : "bg-brand-50 text-brand-900"
                  }`}
                >
                  Add Customer
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setLeftPanelMode("search")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  leftPanelMode === "search"
                    ? "bg-brand-700 text-white"
                    : "bg-brand-50 text-brand-900"
                } ${isAdmin ? "" : "col-span-2"}`}
              >
                Search Customer
              </button>
            </div>
          </div>

          {isAdmin && leftPanelMode === "add" ? (
            <form onSubmit={createCustomer} className="space-y-2 rounded-xl border border-brand-100 bg-brand-50 p-3">
              <p className="text-sm font-bold text-brand-900">Add Customer</p>
              <input
                required
                placeholder="Name"
                value={customerForm.name}
                onChange={(e) => setCustomerForm((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-lg border border-brand-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Phone"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm((s) => ({ ...s, phone: e.target.value }))}
                className="w-full rounded-lg border border-brand-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Email"
                value={customerForm.email}
                onChange={(e) => setCustomerForm((s) => ({ ...s, email: e.target.value }))}
                className="w-full rounded-lg border border-brand-300 px-2 py-1 text-sm"
              />
              <button className="w-full rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white">Save</button>
            </form>
          ) : null}

          {leftPanelMode === "search" ? (
            <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50 p-3">
              <p className="text-sm font-bold text-brand-900">Search by name or phone</p>
              <input
                placeholder="Type name or phone number"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-brand-300 px-2 py-1.5 text-sm"
              />
            </div>
          ) : null}

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {filteredCustomers.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No customer found.</p>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedId(customer.id);
                    loadCustomerDetail(customer.id);
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedId === customer.id
                      ? "border-brand-700 bg-brand-50"
                      : "border-slate-200 bg-white hover:border-brand-300"
                  }`}
                >
                  <p className="font-semibold text-ink">{customer.name}</p>
                  <p className="text-xs text-slate-600">{customer.phone || "No phone"}</p>
                  <p className="mt-1 text-xs text-slate-700">
                    Orders: {customer.order_count} | Paid: {money(customer.total_paid)}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="space-y-4 rounded-2xl bg-white p-4 shadow-panel">
          {!selectedCustomer || !detail ? (
            <p className="text-sm text-slate-600">Select a customer to view details.</p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="font-display text-3xl">{selectedCustomer.name}</h2>
                <p className="text-sm text-slate-600">
                  {selectedCustomer.phone || "No phone"} | {selectedCustomer.email || "No email"}
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-lg font-bold">Measurements</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    {detail.measurements.length === 0 ? (
                      <p className="text-slate-500">No measurements yet.</p>
                    ) : (
                      detail.measurements.slice(0, 6).map((m) => (
                        <div key={m.id} className="rounded-lg bg-slate-50 p-2">
                          Chest {m.chest || "-"} | Waist {m.waist || "-"} | Sleeve {m.sleeve || "-"} | Length {m.length || "-"}
                        </div>
                      ))
                    )}
                  </div>

                  {isAdmin ? (
                    <form onSubmit={addMeasurement} className="mt-3 space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <input placeholder="Neck" value={measurementForm.neck} onChange={(e) => setMeasurementForm((s) => ({ ...s, neck: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Chest" value={measurementForm.chest} onChange={(e) => setMeasurementForm((s) => ({ ...s, chest: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Waist" value={measurementForm.waist} onChange={(e) => setMeasurementForm((s) => ({ ...s, waist: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Hip" value={measurementForm.hip} onChange={(e) => setMeasurementForm((s) => ({ ...s, hip: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Shoulder" value={measurementForm.shoulder} onChange={(e) => setMeasurementForm((s) => ({ ...s, shoulder: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Sleeve" value={measurementForm.sleeve} onChange={(e) => setMeasurementForm((s) => ({ ...s, sleeve: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Length" value={measurementForm.length} onChange={(e) => setMeasurementForm((s) => ({ ...s, length: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Inseam" value={measurementForm.inseam} onChange={(e) => setMeasurementForm((s) => ({ ...s, inseam: e.target.value }))} className="rounded-lg border px-2 py-1" />
                        <input placeholder="Measurement notes" value={measurementForm.notes} onChange={(e) => setMeasurementForm((s) => ({ ...s, notes: e.target.value }))} className="col-span-2 rounded-lg border px-2 py-1" />
                      </div>

                      <label className="flex items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 text-sm">
                        <input type="checkbox" checked={measurementCreatesOrder} onChange={(e) => setMeasurementCreatesOrder(e.target.checked)} />
                        Save measurement and create order
                      </label>

                      {measurementCreatesOrder ? (
                        <div className="grid grid-cols-2 gap-2 rounded-lg border border-brand-100 bg-brand-50 p-2">
                          <input placeholder="Garment" value={measurementOrderDraft.garment_type} onChange={(e) => setMeasurementOrderDraft((s) => ({ ...s, garment_type: e.target.value }))} className="col-span-2 rounded-lg border px-2 py-1" />
                          <select value={measurementOrderDraft.status} onChange={(e) => setMeasurementOrderDraft((s) => ({ ...s, status: e.target.value }))} className="rounded-lg border px-2 py-1">
                            {ORDER_STATUSES.map((status) => (<option key={status} value={status}>{status}</option>))}
                          </select>
                          <input placeholder="Total" value={measurementOrderDraft.total_amount} onChange={(e) => setMeasurementOrderDraft((s) => ({ ...s, total_amount: e.target.value }))} className="rounded-lg border px-2 py-1" />
                          <input placeholder="Advance" value={measurementOrderDraft.advance_paid} onChange={(e) => setMeasurementOrderDraft((s) => ({ ...s, advance_paid: e.target.value }))} className="rounded-lg border px-2 py-1" />
                          <input type="date" value={measurementOrderDraft.due_date} onChange={(e) => setMeasurementOrderDraft((s) => ({ ...s, due_date: e.target.value }))} className="rounded-lg border px-2 py-1" />
                          <input placeholder="Order note" value={measurementOrderDraft.notes} onChange={(e) => setMeasurementOrderDraft((s) => ({ ...s, notes: e.target.value }))} className="col-span-2 rounded-lg border px-2 py-1" />
                        </div>
                      ) : null}

                      <button className="w-full rounded-lg bg-brand-700 px-3 py-1.5 font-semibold text-white">Save measurement</button>
                    </form>
                  ) : null}
                </article>

                <article className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-lg font-bold">Orders & Payments</h3>

                  <div className="mt-2 space-y-2 text-sm">
                    {detail.orders.length === 0 ? (
                      <p className="text-slate-500">No orders yet.</p>
                    ) : (
                      detail.orders.map((order) => {
                        const balance = Number(order.total_amount) - Number(order.paid_total);
                        return (
                          <div key={order.id} className="rounded-lg bg-slate-50 p-3">
                            <p className="font-semibold">#{order.id} {order.garment_type} ({order.status})</p>
                            <p>Total: {money(order.total_amount)} | Advance: {money(order.advance_paid)} | Paid: {money(order.paid_total)} | Balance: {money(balance)}</p>
                            <p className="text-xs text-slate-600">Snapshot: {order.snapshot_created_at ? `Chest ${order.snap_chest || "-"}, Waist ${order.snap_waist || "-"}, Sleeve ${order.snap_sleeve || "-"}, Length ${order.snap_length || "-"}` : "No measurement snapshot"}</p>

                            {isAdmin ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <select value={statusDraft[order.id] || order.status} onChange={(e) => setStatusDraft((prev) => ({ ...prev, [order.id]: e.target.value }))} className="rounded-lg border px-2 py-1">
                                  {ORDER_STATUSES.map((status) => (<option key={status} value={status}>{status}</option>))}
                                </select>
                                <button type="button" onClick={() => updateOrderStatus(order.id, order.status)} className="rounded-lg bg-ink px-3 py-1 text-white">Update</button>
                              </div>
                            ) : null}

                            {isAdmin ? (
                              <div className="mt-2 flex gap-2">
                                <input placeholder="Payment" value={paymentDraft[order.id] || ""} onChange={(e) => setPaymentDraft((prev) => ({ ...prev, [order.id]: e.target.value }))} className="w-28 rounded-lg border px-2 py-1" />
                                <button type="button" onClick={() => addPayment(order.id)} className="rounded-lg bg-brand-700 px-3 py-1 text-white">Add payment</button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {isAdmin ? (
                    <form onSubmit={createOrder} className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <input placeholder="Garment" value={orderForm.garment_type} onChange={(e) => setOrderForm((s) => ({ ...s, garment_type: e.target.value }))} className="col-span-2 rounded-lg border px-2 py-1" />
                      <select value={orderForm.status} onChange={(e) => setOrderForm((s) => ({ ...s, status: e.target.value }))} className="rounded-lg border px-2 py-1">
                        {ORDER_STATUSES.map((status) => (<option key={status} value={status}>{status}</option>))}
                      </select>
                      <input placeholder="Total" value={orderForm.total_amount} onChange={(e) => setOrderForm((s) => ({ ...s, total_amount: e.target.value }))} className="rounded-lg border px-2 py-1" />
                      <input placeholder="Advance" value={orderForm.advance_paid} onChange={(e) => setOrderForm((s) => ({ ...s, advance_paid: e.target.value }))} className="rounded-lg border px-2 py-1" />
                      <input type="date" value={orderForm.due_date} onChange={(e) => setOrderForm((s) => ({ ...s, due_date: e.target.value }))} className="rounded-lg border px-2 py-1" />
                      <input placeholder="Order note" value={orderForm.notes} onChange={(e) => setOrderForm((s) => ({ ...s, notes: e.target.value }))} className="col-span-2 rounded-lg border px-2 py-1" />
                      <label className="col-span-2 flex items-center gap-2 rounded-lg bg-brand-50 px-2 py-1"><input type="checkbox" checked={orderUseLatestMeasurement} onChange={(e) => setOrderUseLatestMeasurement(e.target.checked)} />Attach latest measurement snapshot</label>
                      <button className="col-span-2 rounded-lg bg-brand-700 px-3 py-1.5 font-semibold text-white">Create order</button>
                    </form>
                  ) : null}
                </article>

                <article className="rounded-xl border border-slate-200 p-4 xl:col-span-2">
                  <h3 className="text-lg font-bold">Customer Timeline</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    {!detail.timeline || detail.timeline.length === 0 ? (
                      <p className="text-slate-500">No timeline activity yet.</p>
                    ) : (
                      detail.timeline.map((item, index) => (
                        <div key={`${item.event_type}-${item.order_id}-${index}`} className="rounded-lg bg-slate-50 p-3">
                          <p className="font-semibold">
                            {item.event_type === "order_created"
                              ? `Order #${item.order_id} created (${item.garment_type || "-"})`
                              : item.event_type === "status_change"
                              ? `Order #${item.order_id} status: ${item.from_status || "-"} -> ${item.to_status || "-"}`
                              : `Payment ${money(item.amount)} for order #${item.order_id}`}
                          </p>
                          <p className="text-xs text-slate-600">{dateTime(item.happened_at)}</p>
                          {item.method ? <p className="text-xs text-slate-600">Method: {item.method}</p> : null}
                          {item.note ? <p className="text-xs text-slate-600">Note: {item.note}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
