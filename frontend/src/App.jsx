import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const GARMENT_TYPES = ["Shirt", "Pant", "Suit", "Blouse", "Kurti", "Other"];
const FLOW_STEPS = [
  { id: 2, label: "Measurements" },
  { id: 3, label: "Items" },
  { id: 4, label: "Payments" },
  { id: 5, label: "Review" }
];

const GARMENT_FIELDS = {
  Shirt: [
    ["neck", "Neck"],
    ["chest", "Chest"],
    ["waist", "Waist"],
    ["shoulder", "Shoulder"],
    ["sleeve", "Sleeve"],
    ["length", "Length"]
  ],
  Pant: [
    ["waist", "Waist"],
    ["hip", "Hip"],
    ["inseam", "Inseam"],
    ["length", "Length"]
  ],
  Suit: [
    ["neck", "Neck"],
    ["chest", "Chest"],
    ["waist", "Waist"],
    ["hip", "Hip"],
    ["shoulder", "Shoulder"],
    ["sleeve", "Sleeve"],
    ["length", "Length"],
    ["inseam", "Inseam"]
  ],
  Blouse: [
    ["bust", "Bust"],
    ["waist", "Waist"],
    ["shoulder", "Shoulder"],
    ["sleeve", "Sleeve"],
    ["blouse_length", "Blouse Length"]
  ],
  Kurti: [
    ["bust", "Bust"],
    ["waist", "Waist"],
    ["hip", "Hip"],
    ["shoulder", "Shoulder"],
    ["sleeve", "Sleeve"],
    ["kurti_length", "Kurti Length"]
  ]
};

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
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function toLabel(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFieldsForGarment(garmentType) {
  return GARMENT_FIELDS[garmentType] || [];
}

function getEmptyMeasurementData(garmentType) {
  if (garmentType === "Other") {
    return { custom_details: "" };
  }

  const data = {};
  getFieldsForGarment(garmentType).forEach(([key]) => {
    data[key] = "";
  });
  return data;
}

function normalizeMeasurementData(garmentType, source) {
  const base = getEmptyMeasurementData(garmentType);
  const input = source && typeof source === "object" ? source : {};
  Object.keys(base).forEach((key) => {
    if (input[key] !== undefined && input[key] !== null) {
      base[key] = String(input[key]);
    }
  });
  return base;
}

function getLegacyMeasurementData(row) {
  if (!row || typeof row !== "object") return {};

  const keys = [
    "neck",
    "chest",
    "waist",
    "hip",
    "shoulder",
    "sleeve",
    "length",
    "inseam",
    "bust",
    "blouse_length",
    "kurti_length"
  ];

  const data = {};
  keys.forEach((key) => {
    if (row[key] !== null && row[key] !== undefined && row[key] !== "") {
      data[key] = row[key];
    }
  });

  if (row.notes) data.custom_details = row.notes;
  return data;
}

function summarizeMeasurementData(data, fallbackText = "No measurements") {
  if (!data || typeof data !== "object") return fallbackText;

  const entries = Object.entries(data).filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim() !== ""
  );

  if (entries.length === 0) return fallbackText;

  return entries
    .slice(0, 6)
    .map(([key, value]) => `${toLabel(key)} ${value}`)
    .join(" | ");
}

function emptyCustomerForm() {
  return { name: "", phone: "", email: "" };
}

function emptyMeasurementDraft() {
  return {
    garment_type: "Shirt",
    garment_type_other: "",
    measurement_data: getEmptyMeasurementData("Shirt"),
    measurement_note: ""
  };
}

function emptyPaymentDraft() {
  return {
    advance_paid: "0",
    notes: ""
  };
}

function createOrderItem() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    item_type: "Shirt",
    quantity: "1",
    rate: ""
  };
}

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-IN");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getStepState(stepId, wizardStep, stepCompleted) {
  if (wizardStep === stepId) return "active";
  if (stepCompleted[stepId]) return "done";
  return "idle";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [leftPanelMode, setLeftPanelMode] = useState("search");
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);

  const [wizardStep, setWizardStep] = useState(2);
  const [toast, setToast] = useState(null);

  const [measurementDraft, setMeasurementDraft] = useState(emptyMeasurementDraft);
  const [savedMeasurements, setSavedMeasurements] = useState([]);
  const [autofillCustomerId, setAutofillCustomerId] = useState(null);

  const [orderItems, setOrderItems] = useState([createOrderItem()]);
  const [paymentDraft, setPaymentDraft] = useState(emptyPaymentDraft);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [showOrderCreatedModal, setShowOrderCreatedModal] = useState(false);
  const [completionModalOrder, setCompletionModalOrder] = useState(null);
  const [completionMethod, setCompletionMethod] = useState("cash");
  const [completionNote, setCompletionNote] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState(null);
  const [ordersModalTab, setOrdersModalTab] = useState("current");
  const [showMeasurementErrors, setShowMeasurementErrors] = useState(false);
  const [showItemErrors, setShowItemErrors] = useState(false);
  const [showPaymentErrors, setShowPaymentErrors] = useState(false);
  const [stepSaved, setStepSaved] = useState({ 2: false, 3: false, 4: false });
  const [orderDate, setOrderDate] = useState(todayIsoDate());

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!token) return;
    loadSession();
  }, [token]);

  useEffect(() => {
    setMeasurementDraft(emptyMeasurementDraft());
    setSavedMeasurements([]);
    setOrderItems([createOrderItem()]);
    setPaymentDraft(emptyPaymentDraft());
    setWizardStep(2);
    setShowMeasurementErrors(false);
    setShowItemErrors(false);
    setShowPaymentErrors(false);
    setStepSaved({ 2: false, 3: false, 4: false });
    setAutofillCustomerId(null);
    setOrderDate(todayIsoDate());
  }, [selectedId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!detail?.customer?.id) return;
    if (autofillCustomerId === detail.customer.id) return;

    const latestShirt = findLatestMeasurementForItemType("Shirt");
    const source =
      latestShirt && latestShirt.measurement_data && Object.keys(latestShirt.measurement_data).length > 0
        ? latestShirt.measurement_data
        : getLegacyMeasurementData(latestShirt);

    setMeasurementDraft((prev) => ({
      ...prev,
      garment_type: "Shirt",
      garment_type_other: "",
      measurement_data: normalizeMeasurementData("Shirt", source),
      measurement_note: latestShirt?.notes || ""
    }));
    setAutofillCustomerId(detail.customer.id);
  }, [detail, autofillCustomerId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedId) || null,
    [customers, selectedId]
  );

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => {
      const byName = String(customer.name || "").toLowerCase().includes(query);
      const byPhone = String(customer.phone || "").toLowerCase().includes(query);
      return byName || byPhone;
    });
  }, [customers, searchQuery]);

  const orderItemsWithTotals = useMemo(
    () =>
      orderItems.map((item) => {
        const qty = Math.max(1, parseInt(item.quantity || "1", 10) || 1);
        const rate = Math.max(0, parseNumber(item.rate, 0));
        return {
          ...item,
          quantity_num: qty,
          rate_num: rate,
          line_total: qty * rate
        };
      }),
    [orderItems]
  );

  const subtotal = useMemo(
    () => orderItemsWithTotals.reduce((sum, item) => sum + item.line_total, 0),
    [orderItemsWithTotals]
  );

  const selectedItemTypes = useMemo(
    () =>
      orderItems
        .map((item) => String(item.item_type || "").trim().toLowerCase())
        .filter(Boolean),
    [orderItems]
  );

  const paymentSummary = useMemo(() => {
    const advance = Math.max(0, parseNumber(paymentDraft.advance_paid, 0));
    const finalTotal = subtotal;
    return {
      finalTotal,
      advance,
      balance: finalTotal - advance
    };
  }, [subtotal, paymentDraft]);

  const measurementFields = getFieldsForGarment(measurementDraft.garment_type);
  const measurementFieldErrors = useMemo(() => {
    if (measurementDraft.garment_type === "Other") {
      const missingCustom = !String(measurementDraft.measurement_data.custom_details || "").trim();
      const missingType = !String(measurementDraft.garment_type_other || "").trim();
      return { missingCustom, missingType, missingKeys: [] };
    }
    const missingKeys = measurementFields
      .map(([fieldKey]) => fieldKey)
      .filter((fieldKey) => !String(measurementDraft.measurement_data[fieldKey] || "").trim());
    return { missingCustom: false, missingType: false, missingKeys };
  }, [measurementDraft, measurementFields]);

  const itemErrors = useMemo(
    () =>
      orderItemsWithTotals.map((item) => ({
        itemId: item.id,
        itemTypeMissing: !String(item.item_type || "").trim(),
        quantityMissing: !String(item.quantity || "").trim() || item.quantity_num <= 0,
        rateMissing: !String(item.rate || "").trim()
      })),
    [orderItemsWithTotals]
  );

  const hasItemErrors = useMemo(
    () => itemErrors.some((item) => item.itemTypeMissing || item.quantityMissing || item.rateMissing),
    [itemErrors]
  );

  const hasValidItems = useMemo(
    () =>
      orderItemsWithTotals.length > 0 &&
      !hasItemErrors &&
      subtotal > 0,
    [orderItemsWithTotals, hasItemErrors, subtotal]
  );

  const hasValidPayment = useMemo(() => {
    if (!hasValidItems) return false;
    return paymentSummary.advance <= subtotal;
  }, [hasValidItems, paymentSummary, subtotal]);

  const orderBuckets = useMemo(() => {
    const orders = detail?.orders || [];
    return {
      current: orders.filter((order) => order.status !== "completed"),
      completed: orders.filter((order) => order.status === "completed")
    };
  }, [detail]);

  const stepCompleted = useMemo(
    () => ({
      2: stepSaved[2],
      3: stepSaved[3],
      4: stepSaved[4],
      5: stepSaved[2] && stepSaved[3] && stepSaved[4]
    }),
    [stepSaved]
  );

  function resolveMeasurementType(draft = measurementDraft) {
    if (draft.garment_type === "Other") {
      return String(draft.garment_type_other || "").trim();
    }
    return draft.garment_type;
  }

  function findLatestMeasurementForItemType(itemType) {
    if (!detail?.measurements || !itemType) return null;
    const target = String(itemType).trim().toLowerCase();
    if (!target) return null;

    return (
      detail.measurements.find(
        (measurement) => String(measurement.item_type || "").trim().toLowerCase() === target
      ) || null
    );
  }

  function applyMeasurementAutofill(nextType, customType = "", options = {}) {
    const lookupType = nextType === "Other" ? customType : nextType;
    const latest = findLatestMeasurementForItemType(lookupType);
    const source =
      latest && latest.measurement_data && Object.keys(latest.measurement_data).length > 0
        ? latest.measurement_data
        : getLegacyMeasurementData(latest);

    setMeasurementDraft((prev) => ({
      ...prev,
      garment_type: nextType,
      garment_type_other: nextType === "Other" ? customType : "",
      measurement_data: normalizeMeasurementData(nextType, source),
      measurement_note: latest?.notes || prev.measurement_note
    }));
    setStepSaved((prev) => ({ ...prev, 2: false }));

    if (latest && !options.silent) {
      // keep silent in normal flow to avoid noisy notifications
    }
  }

  function loadMeasurementFromHistory(measurement) {
    const isPresetType = GARMENT_TYPES.includes(measurement.item_type)
      ? measurement.item_type
      : "Other";
    const source =
      measurement.measurement_data && Object.keys(measurement.measurement_data).length > 0
        ? measurement.measurement_data
        : getLegacyMeasurementData(measurement);

    setMeasurementDraft((prev) => ({
      ...prev,
      garment_type: isPresetType,
      garment_type_other: isPresetType === "Other" ? measurement.item_type || "" : "",
      measurement_data: normalizeMeasurementData(isPresetType, source),
      measurement_note: measurement.notes || ""
    }));
    setStepSaved((prev) => ({ ...prev, 2: true }));
    setShowMeasurementErrors(false);
    setWizardStep(2);
  }

  async function deleteMeasurement(measurementId) {
    if (!selectedId) return;
    const confirmed = window.confirm("Delete this measurement?");
    if (!confirmed) return;

    try {
      setError("");
      await api(`/api/customers/${selectedId}/measurements/${measurementId}`, { method: "DELETE" }, token);
      setSavedMeasurements((prev) => prev.filter((row) => row.id !== measurementId));
      setToast({ type: "success", message: "Measurement deleted." });
      await loadCustomerDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  function updateMeasurementField(key, value) {
    setMeasurementDraft((prev) => ({
      ...prev,
      measurement_data: {
        ...prev.measurement_data,
        [key]: value
      }
    }));
    setStepSaved((prev) => ({ ...prev, 2: false }));
  }

  function updateOrderItem(itemId, key, value) {
    if (key === "item_type") {
      const nextType = String(value || "").trim().toLowerCase();
      const duplicateExists = orderItems.some(
        (item) =>
          item.id !== itemId && String(item.item_type || "").trim().toLowerCase() === nextType
      );
      if (duplicateExists) {
        setError("This item type is already added in the order.");
        return;
      }
    }
    setError("");
    setOrderItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, [key]: value } : item)));
    setStepSaved((prev) => ({ ...prev, 3: false, 4: false }));
  }

  function removeOrderItem(itemId) {
    setOrderItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== itemId)));
    setStepSaved((prev) => ({ ...prev, 3: false, 4: false }));
  }

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

  async function selectCustomer(customerId) {
    setSelectedId(customerId);
    setWizardStep(2);
    await loadCustomerDetail(customerId);
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
      const created = await api("/api/customers", { method: "POST", body: JSON.stringify(customerForm) }, token);
      setCustomerForm(emptyCustomerForm());
      setToast({
        type: "success",
        message: `Customer added successfully${created?.name ? `: ${created.name}` : ""}.`
      });
      await loadCustomers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveMeasurement() {
    if (!selectedId) return;

    const itemType = resolveMeasurementType();
    if (!itemType) {
      setError("Please choose garment type.");
      return;
    }
    setShowMeasurementErrors(true);
    if (
      measurementFieldErrors.missingType ||
      measurementFieldErrors.missingCustom ||
      measurementFieldErrors.missingKeys.length > 0
    ) {
      setError("Fill all required measurement fields.");
      return;
    }

    try {
      setError("");

      const payload = {
        item_type: itemType,
        notes: measurementDraft.measurement_note,
        measurement_data: normalizeMeasurementData(
          measurementDraft.garment_type,
          measurementDraft.measurement_data
        ),
        create_order: false
      };

      const created = await api(
        `/api/customers/${selectedId}/measurements`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      );

      setSavedMeasurements((prev) => {
        if (prev.some((item) => item.id === created.id)) {
          return prev;
        }
        return [created, ...prev];
      });
      setStepSaved((prev) => ({ ...prev, 2: true }));
      setToast({ type: "success", message: "Measurements saved." });
      setShowItemErrors(false);
      setWizardStep(3);
      await loadCustomerDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  function goToPaymentsStep() {
    setShowItemErrors(true);
    if (!hasValidItems) {
      setError("Add valid items with quantity, rate, and subtotal greater than 0.");
      return;
    }
    setError("");
    setOrderDate(todayIsoDate());
    setStepSaved((prev) => ({ ...prev, 3: true, 4: false }));
    setToast({ type: "success", message: "Items saved." });
    setShowPaymentErrors(false);
    setWizardStep(4);
  }

  function goToReviewStep() {
    setShowPaymentErrors(true);
    if (paymentSummary.advance > paymentSummary.finalTotal) {
      setError("Advance paid cannot exceed final total.");
      return;
    }
    setError("");
    setStepSaved((prev) => ({ ...prev, 4: true }));
    setToast({ type: "success", message: "Payment saved." });
    setWizardStep(5);
  }

  async function createWizardOrder() {
    if (!selectedId) return;

    const normalizedItems = orderItemsWithTotals
      .map((item) => ({
        item_type: String(item.item_type || "").trim(),
        quantity: item.quantity_num,
        rate: item.rate_num
      }))
      .filter((item) => item.item_type && item.quantity > 0);

    if (normalizedItems.length === 0) {
      setError("Please add at least one valid order item.");
      return;
    }

    try {
      setError("");

      const created = await api(
        "/api/orders",
        {
          method: "POST",
          body: JSON.stringify({
            customer_id: selectedId,
            garment_type:
              normalizedItems.length === 1
                ? normalizedItems[0].item_type
                : `${normalizedItems[0].item_type} +${normalizedItems.length - 1} more`,
            items: normalizedItems,
            status: "pending",
            subtotal,
            discount_type: "amount",
            discount_value: 0,
            advance_paid: paymentSummary.advance,
            notes: paymentDraft.notes
          })
        },
        token
      );

      setCreatedOrderId(created.id);
      setShowOrderCreatedModal(true);
      setOrderItems([createOrderItem()]);
      setPaymentDraft(emptyPaymentDraft());
      setShowMeasurementErrors(false);
      setShowItemErrors(false);
      setShowPaymentErrors(false);
      setStepSaved({ 2: false, 3: false, 4: false });
      setWizardStep(2);
      await refreshSelected();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markOrderCompleted(orderId) {
    try {
      setError("");
      await api(
        `/api/orders/${orderId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: "completed",
            status_note: "Completed from orders panel"
          })
        },
        token
      );
      setToast({ type: "success", message: "Order marked as completed." });
      await loadCustomerDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  function startOrderCompletion(order) {
    const totalAmount = Math.max(0, parseNumber(order?.total_amount, 0));
    const paidTotal = Math.max(0, parseNumber(order?.paid_total, 0));
    const due = Math.max(0, totalAmount - paidTotal);

    if (due <= 0.009) {
      markOrderCompleted(order.id);
      return;
    }

    setCompletionMethod("cash");
    setCompletionNote("");
    setCompletionModalOrder({ ...order, due });
  }

  async function collectDueAndComplete() {
    if (!completionModalOrder || !selectedId) return;

    try {
      setError("");
      await api(
        `/api/orders/${completionModalOrder.id}/payments`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: completionModalOrder.due,
            method: completionMethod,
            notes: completionNote || "Collected due while closing order"
          })
        },
        token
      );

      await api(
        `/api/orders/${completionModalOrder.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: "completed",
            status_note: "Completed after collecting due"
          })
        },
        token
      );
      setCompletionModalOrder(null);
      setToast({
        type: "success",
        message: "Due settled. Order marked as completed."
      });
      await loadCustomerDetail(selectedId);
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
              Client history, measurements, and orders in one panel.
            </h1>
            <p className="mt-4 max-w-sm text-sm text-brand-100">
              Admins can create orders step-by-step. Users can safely view all records.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4 p-10">
            <h2 className="font-display text-3xl text-ink">Sign in</h2>
            <label className="block text-sm font-semibold text-ink">
              Email
              <input
                className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Password
              <input
                type="password"
                className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
    <main className="mx-auto flex h-screen w-full max-w-7xl flex-col gap-4 overflow-hidden px-4 py-4 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-900 via-brand-700 to-brand-500 p-4 text-white shadow-2xl">
        <div>
          <h1 className="font-display text-3xl">TailorDesk</h1>
          <p className="text-sm text-brand-50">Signed in as {user?.name} ({user?.role})</p>
        </div>
        <button onClick={logout} className="rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/40">
          Logout
        </button>
      </header>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="flex min-h-0 flex-col gap-4 rounded-2xl bg-white/95 p-4 shadow-2xl ring-1 ring-white/70 backdrop-blur">
          <div className="space-y-2">
            <h2 className="font-display text-2xl">Customers</h2>
            <div className="grid grid-cols-2 gap-2">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setLeftPanelMode("add")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    leftPanelMode === "add" ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-900"
                  }`}
                >
                  Add Customer
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setLeftPanelMode("search");
                  setSearchQuery("");
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  leftPanelMode === "search"
                    ? "bg-brand-700 text-white"
                    : "bg-brand-50 text-brand-900"
                } ${isAdmin ? "" : "col-span-2"}`}
              >
                Search Customer
              </button>
            </div>

            {isAdmin && leftPanelMode === "add" ? (
              <form onSubmit={createCustomer} className="space-y-2 rounded-xl border border-brand-100 bg-brand-50 p-3">
                <p className="text-sm font-bold text-brand-900">Add Customer</p>
                <input
                  required
                  placeholder="Name"
                  value={customerForm.name}
                  onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-brand-300 px-2 py-1 text-sm"
                />
                <input
                  placeholder="Phone"
                  value={customerForm.phone}
                  onChange={(event) => setCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="w-full rounded-lg border border-brand-300 px-2 py-1 text-sm"
                />
                <input
                  placeholder="Email"
                  value={customerForm.email}
                  onChange={(event) => setCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="w-full rounded-lg border border-brand-300 px-2 py-1 text-sm"
                />
                <button className="w-full rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white">
                  Save
                </button>
              </form>
            ) : null}

            {leftPanelMode === "search" ? (
              <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50 p-3">
                <p className="text-sm font-bold text-brand-900">Search by name or mobile</p>
                <input
                  placeholder="Type name or phone number"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm outline-none ring-brand-400 focus:ring"
                />
              </div>
            ) : null}
          </div>

          {leftPanelMode === "search" ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredCustomers.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No customer found.</p>
              ) : (
                filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedId === customer.id
                        ? "border-brand-700 bg-brand-50"
                        : "border-slate-200 bg-white hover:border-brand-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-ink">{customer.name}</p>
                      <p className="text-xs font-semibold text-brand-700">
                        {customer.phone || "No phone"}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </aside>

        <section className="min-h-0 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-2xl ring-1 ring-white/70 backdrop-blur">
          {!selectedCustomer || !detail ? (
            <p className="text-sm text-slate-600">Select a customer to start flow.</p>
          ) : (
            <>
              <div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_360px]">
                <div>
                  <h2 className="font-display text-3xl">{selectedCustomer.name}</h2>
                  <p className="text-sm text-slate-600">
                    {selectedCustomer.phone || "No phone"} | {selectedCustomer.email || "No email"}
                  </p>
                </div>

                <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
                  <button
                    type="button"
                    onClick={() => setShowOrdersModal(true)}
                    className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
                  >
                    View Orders
                  </button>
                </div>
              </div>

              {isAdmin ? (
                <article className="min-h-[620px] rounded-xl border border-slate-200 bg-gradient-to-b from-white to-brand-50/40 p-4">
                  <div className="mb-5 rounded-xl border border-brand-100 bg-white px-4 py-4">
                    <div className="overflow-x-auto">
                      <div className="flex min-w-[760px] items-start gap-2">
                        {FLOW_STEPS.map((step, index) => {
                          const state = getStepState(step.id, wizardStep, stepCompleted);
                          const isDone = state === "done";
                          const isActive = state === "active";
                          const isLast = index === FLOW_STEPS.length - 1;

                          return (
                            <div key={step.id} className="flex min-w-[170px] flex-1 items-start">
                              <button
                                type="button"
                                disabled={step.id > wizardStep && !stepCompleted[step.id - 1]}
                                onClick={() => setWizardStep(step.id)}
                                className="flex min-w-[120px] shrink-0 flex-col items-center gap-2 text-center"
                              >
                                <span
                                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition ${
                                    isDone
                                      ? "border-emerald-600 bg-emerald-600 text-white"
                                      : isActive
                                      ? "border-orange-500 bg-orange-500 text-white"
                                      : "border-slate-300 bg-white text-slate-500"
                                  }`}
                                >
                                  {isDone ? "✓" : step.id - 1}
                                </span>
                                <span
                                  className={`text-sm font-semibold ${
                                    isDone
                                      ? "text-emerald-700"
                                      : isActive
                                      ? "text-orange-700"
                                      : "text-slate-600"
                                  }`}
                                >
                                  {step.label}
                                </span>
                              </button>
                              {!isLast ? (
                                <div
                                  className={`mx-2 mt-4 h-[3px] w-full min-w-[36px] rounded-full ${
                                    stepCompleted[step.id] ? "bg-emerald-500" : "bg-slate-200"
                                  }`}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {wizardStep === 2 ? (
                    <div className="h-[520px] space-y-4 overflow-y-auto rounded-2xl border border-brand-100 bg-white/90 p-4 text-sm shadow-inner">
                      <h3 className="text-lg font-bold">
                        Step 1: Measurements {stepCompleted[2] ? "✓" : ""}
                      </h3>
                      <p className="text-xs text-slate-600">
                        Select garment type. If previous measurement exists, it is auto-filled.
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={measurementDraft.garment_type}
                          onChange={(event) => applyMeasurementAutofill(event.target.value)}
                          className="col-span-2 rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm outline-none ring-brand-400 focus:ring"
                        >
                          {GARMENT_TYPES.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>

                        {measurementDraft.garment_type === "Other" ? (
                          <input
                            placeholder="Custom garment type"
                            value={measurementDraft.garment_type_other}
                            onChange={(event) => applyMeasurementAutofill("Other", event.target.value)}
                            className={`rounded-xl border bg-white px-3 py-2 text-sm shadow-sm outline-none ring-brand-400 focus:ring ${
                              showMeasurementErrors && measurementFieldErrors.missingType
                                ? "border-red-400"
                                : "border-brand-200"
                            }`}
                          />
                        ) : null}

                        {measurementFields.length > 0 ? (
                          measurementFields.map(([fieldKey, label]) => (
                            <label key={fieldKey} className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                              <span>{label}</span>
                              <input
                                value={measurementDraft.measurement_data[fieldKey] || ""}
                                onChange={(event) => updateMeasurementField(fieldKey, event.target.value)}
                                className={`w-full rounded-xl border bg-white px-3 py-2 text-sm font-medium normal-case text-ink shadow-sm outline-none ring-brand-400 focus:ring ${
                                  showMeasurementErrors &&
                                  measurementFieldErrors.missingKeys.includes(fieldKey)
                                    ? "border-red-400"
                                    : "border-brand-200"
                                }`}
                              />
                            </label>
                          ))
                        ) : (
                          <label className="col-span-2 space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                            <span>Detail</span>
                            <textarea
                              placeholder="Custom measurement details"
                              value={measurementDraft.measurement_data.custom_details || ""}
                              onChange={(event) => updateMeasurementField("custom_details", event.target.value)}
                              className={`min-h-20 w-full rounded-xl border bg-white px-3 py-2 text-sm font-medium normal-case text-ink shadow-sm outline-none ring-brand-400 focus:ring ${
                                showMeasurementErrors && measurementFieldErrors.missingCustom
                                  ? "border-red-400"
                                  : "border-brand-200"
                              }`}
                            />
                          </label>
                        )}
                        <label className="col-span-2 space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                          <span>Detail</span>
                          <input
                            placeholder="Additional note"
                            value={measurementDraft.measurement_note}
                            onChange={(event) =>
                              setMeasurementDraft((prev) => ({ ...prev, measurement_note: event.target.value }))
                            }
                            className="w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-medium normal-case text-ink shadow-sm outline-none ring-brand-400 focus:ring"
                          />
                        </label>
                      </div>
                      {showMeasurementErrors &&
                      (measurementFieldErrors.missingType ||
                        measurementFieldErrors.missingCustom ||
                        measurementFieldErrors.missingKeys.length > 0) ? (
                        <p className="text-xs font-semibold text-red-600">
                          Required fields are highlighted in red.
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={saveMeasurement}
                          className="rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white shadow-lg shadow-brand-700/30"
                        >
                          Save & Next
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {wizardStep === 3 ? (
                    <div className="h-[520px] space-y-4 overflow-y-auto rounded-2xl border border-brand-100 bg-white/90 p-4 text-sm shadow-inner">
                      <h3 className="text-lg font-bold">
                        Step 2: Items {stepCompleted[3] ? "✓" : ""}
                      </h3>
                      <p className="text-xs text-slate-600">Add one or more items. Subtotal is auto-calculated.</p>

                      <div className="space-y-2">
                        {orderItemsWithTotals.map((item) => (
                          <div key={item.id} className="grid grid-cols-12 gap-2 rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                            {(() => {
                              const rowError =
                                itemErrors.find((row) => row.itemId === item.id) || {};
                              return (
                                <>
                            <select
                              value={item.item_type}
                              onChange={(event) => updateOrderItem(item.id, "item_type", event.target.value)}
                              className={`col-span-4 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none ring-brand-400 focus:ring ${
                                showItemErrors && rowError.itemTypeMissing
                                  ? "border-red-400"
                                  : "border-brand-200"
                              }`}
                            >
                              {GARMENT_TYPES.map((type) => (
                                <option
                                  key={type}
                                  value={type}
                                  disabled={orderItems.some(
                                    (other) =>
                                      other.id !== item.id &&
                                      String(other.item_type || "").trim().toLowerCase() ===
                                        type.toLowerCase()
                                  )}
                                >
                                  {type}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={item.quantity}
                              onChange={(event) => updateOrderItem(item.id, "quantity", event.target.value)}
                              className={`col-span-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none ring-brand-400 focus:ring ${
                                showItemErrors && rowError.quantityMissing
                                  ? "border-red-400"
                                  : "border-brand-200"
                              }`}
                            />
                            <input
                              type="number"
                              min="0"
                              placeholder="Rate"
                              value={item.rate}
                              onChange={(event) => updateOrderItem(item.id, "rate", event.target.value)}
                              className={`col-span-3 rounded-xl border bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none ring-brand-400 focus:ring ${
                                showItemErrors && rowError.rateMissing
                                  ? "border-red-400"
                                  : "border-brand-200"
                              }`}
                            />
                            <div className="col-span-2 rounded-xl border border-brand-200 bg-brand-50 px-2 py-2 text-xs font-semibold text-brand-900">
                              {money(item.line_total)}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOrderItem(item.id)}
                              className="col-span-1 rounded-xl bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                            >
                              X
                            </button>
                                </>
                              );
                            })()}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const nextType = GARMENT_TYPES.find(
                              (type) => !selectedItemTypes.includes(type.toLowerCase())
                            );
                            if (!nextType) {
                              setError("All available item types are already added.");
                              return;
                            }
                            setError("");
                            setOrderItems((prev) => [...prev, { ...createOrderItem(), item_type: nextType }]);
                          }}
                          className="rounded-lg bg-brand-700 px-3 py-1.5 font-semibold text-white shadow-lg shadow-brand-700/20"
                        >
                          Add Item
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardStep(2)}
                          className="rounded-lg bg-slate-200 px-3 py-1.5 font-semibold text-slate-700"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={goToPaymentsStep}
                          className="rounded-lg bg-ink px-4 py-2 font-semibold text-white"
                        >
                          Save & Next
                        </button>
                      </div>

                      <p className="text-sm font-semibold text-ink">Subtotal: {money(subtotal)}</p>
                      {showItemErrors && (hasItemErrors || subtotal <= 0) ? (
                        <p className="text-xs font-semibold text-red-600">
                          Fill item type, quantity, and rate for each row. Subtotal must be greater than 0.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {wizardStep === 4 ? (
                    <div className="h-[520px] space-y-4 overflow-y-auto rounded-2xl border border-brand-100 bg-white/90 p-4 text-sm shadow-inner">
                      <h3 className="text-lg font-bold">
                        Step 3: Payments {stepCompleted[4] ? "✓" : ""}
                      </h3>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs text-slate-500">Subtotal</p>
                          <p className="font-semibold">{money(subtotal)}</p>
                        </div>

                        <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs text-slate-500">Final Total</p>
                          <p className="font-semibold">{money(paymentSummary.finalTotal)}</p>
                        </div>

                        <label
                          className={`rounded-xl border bg-white p-3 shadow-sm ${
                            showPaymentErrors && paymentSummary.advance > paymentSummary.finalTotal
                              ? "border-red-400"
                              : "border-brand-100"
                          }`}
                        >
                          <p className="text-xs text-slate-500">Advance</p>
                          <input
                            type="number"
                            min="0"
                            value={paymentDraft.advance_paid}
                            onChange={(event) =>
                              setPaymentDraft((prev) => ({ ...prev, advance_paid: event.target.value }))
                            }
                            className="mt-1 w-full rounded-lg border border-brand-200 bg-white px-2 py-1.5 text-sm font-medium outline-none ring-brand-400 focus:ring"
                            placeholder="Enter advance"
                          />
                        </label>

                        <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs text-slate-500">Balance</p>
                          <p className="font-semibold">{money(paymentSummary.balance)}</p>
                        </div>

                        <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs text-slate-500">Order Date</p>
                          <p className="font-semibold text-ink">{orderDate}</p>
                        </div>

                        <input
                          placeholder="Order Note"
                          value={paymentDraft.notes}
                          onChange={(event) => setPaymentDraft((prev) => ({ ...prev, notes: event.target.value }))}
                          className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none ring-brand-400 focus:ring"
                        />
                      </div>
                      {showPaymentErrors && paymentSummary.advance > paymentSummary.finalTotal ? (
                        <p className="text-xs font-semibold text-red-600">
                          Advance cannot exceed final total.
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setWizardStep(3)}
                          className="rounded-lg bg-slate-200 px-3 py-1.5 font-semibold text-slate-700"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={goToReviewStep}
                          className="rounded-lg bg-ink px-4 py-2 font-semibold text-white"
                        >
                          Save & Next
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {wizardStep === 5 ? (
                    <div className="h-[520px] space-y-4 overflow-y-auto rounded-2xl border border-brand-100 bg-white/90 p-4 text-sm shadow-inner">
                      <h3 className="text-lg font-bold">
                        Step 4: Review {stepCompleted[5] ? "✓" : ""}
                      </h3>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs font-semibold text-slate-600">Customer</p>
                          <p className="font-semibold text-ink">{selectedCustomer.name}</p>
                          <p className="text-xs text-slate-600">{selectedCustomer.phone || "No phone"}</p>
                        </div>

                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs font-semibold text-slate-600">Order Date</p>
                          <p className="font-semibold text-ink">{orderDate}</p>
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-600">Measurements</p>
                        {(savedMeasurements.length > 0 ? savedMeasurements : detail.measurements.slice(0, 3)).map(
                          (measurement) => {
                            const data =
                              measurement.measurement_data &&
                              Object.keys(measurement.measurement_data).length > 0
                                ? measurement.measurement_data
                                : getLegacyMeasurementData(measurement);
                            return (
                              <p key={measurement.id} className="text-xs text-slate-700">
                                {measurement.item_type}: {summarizeMeasurementData(data)}
                              </p>
                            );
                          }
                        )}
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-600">Items</p>
                        {orderItemsWithTotals.map((item) => (
                          <p key={item.id} className="text-xs text-slate-700">
                            {item.quantity_num} x {item.item_type} x {money(item.rate_num)} = {money(item.line_total)}
                          </p>
                        ))}
                        <p className="mt-2 text-sm font-semibold text-ink">Subtotal: {money(subtotal)}</p>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-600">Payment</p>
                        <p className="text-xs text-slate-700">Final Total: {money(paymentSummary.finalTotal)}</p>
                        <p className="text-xs text-slate-700">Advance Paid: {money(paymentSummary.advance)}</p>
                        <p className="text-xs font-semibold text-ink">Balance: {money(paymentSummary.balance)}</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setWizardStep(4)}
                          className="rounded-lg bg-slate-200 px-3 py-1.5 font-semibold text-slate-700"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={createWizardOrder}
                          className="rounded-lg bg-brand-700 px-3 py-1.5 font-semibold text-white"
                        >
                          Create Order
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <article className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-lg font-bold">Measurement History</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    {detail.measurements.length === 0 ? (
                      <p className="text-slate-500">No measurements yet.</p>
                    ) : (
                      detail.measurements.slice(0, 8).map((measurement) => {
                        const data =
                          measurement.measurement_data &&
                          Object.keys(measurement.measurement_data).length > 0
                            ? measurement.measurement_data
                            : getLegacyMeasurementData(measurement);

                        return (
                          <div
                            key={measurement.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => loadMeasurementFromHistory(measurement)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                loadMeasurementFromHistory(measurement);
                              }
                            }}
                            className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition hover:border-brand-300 hover:bg-white"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold">{measurement.item_type || "Item"}</p>
                                <p className="text-xs text-slate-700">
                                  {summarizeMeasurementData(data, measurement.notes || "No measurements")}
                                </p>
                              </div>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteMeasurement(measurement.id);
                                  }}
                                  className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              </div>
            </>
          )}
        </section>
      </section>

      {showOrdersModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="h-[80vh] w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl text-ink">Orders</h3>
              <button
                type="button"
                onClick={() => setShowOrdersModal(false)}
                className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setOrdersModalTab("current")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  ordersModalTab === "current"
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Current ({orderBuckets.current.length})
              </button>
              <button
                type="button"
                onClick={() => setOrdersModalTab("completed")}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  ordersModalTab === "completed"
                    ? "bg-brand-700 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                Completed ({orderBuckets.completed.length})
              </button>
            </div>

            <div className="mt-4 h-[calc(80vh-120px)] space-y-2 overflow-y-auto pr-1">
              {(ordersModalTab === "current" ? orderBuckets.current : orderBuckets.completed).length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No orders found.</p>
              ) : (
                (ordersModalTab === "current" ? orderBuckets.current : orderBuckets.completed).map((order) => {
                  const detailedTypes =
                    Array.isArray(order.items) && order.items.length > 0
                      ? order.items.map((item) => `${item.item_type} x${item.quantity}`).join(", ")
                      : order.garment_type || "Order";

                  return (
                    <div key={order.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-ink">
                          #{order.id} {detailedTypes} ({order.status})
                        </p>
                        {ordersModalTab === "current" && isAdmin ? (
                          <button
                            type="button"
                            onClick={() => startOrderCompletion(order)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Mark Completed
                          </button>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-700">
                        Total: {money(order.total_amount)} | Paid: {money(order.paid_total)} | Created:{" "}
                        {formatDateTime(order.created_at)}
                      </p>
                      {ordersModalTab === "current" ? (
                        <p className="text-xs font-semibold text-orange-700">
                          Due:{" "}
                          {money(
                            Math.max(0, parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0))
                          )}
                        </p>
                      ) : null}
                      {Array.isArray(order.items) && order.items.length > 0 ? (
                        <div className="mt-1 space-y-1">
                          {order.items.map((item) => (
                            <p key={item.id} className="text-xs text-slate-600">
                              {item.quantity} x {item.item_type} x {money(item.rate)} = {money(item.line_total)}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showOrderCreatedModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">Order Created</h3>
            <p className="mt-2 text-sm text-slate-700">
              Order {createdOrderId ? `#${createdOrderId}` : ""} created successfully. You can view orders in
              View Orders section.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowOrderCreatedModal(false);
                  setShowOrdersModal(true);
                }}
                className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white"
              >
                View Orders
              </button>
              <button
                type="button"
                onClick={() => setShowOrderCreatedModal(false)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {completionModalOrder ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">Settle Due To Complete Order</h3>
            <p className="mt-2 text-sm text-slate-700">
              Order #{completionModalOrder.id} has pending due of{" "}
              <span className="font-bold text-orange-700">{money(completionModalOrder.due)}</span>.
            </p>

            <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-slate-700">
              <p>Total: {money(completionModalOrder.total_amount)}</p>
              <p>Paid: {money(completionModalOrder.paid_total)}</p>
              <p>Due: {money(completionModalOrder.due)}</p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Payment Method
                <select
                  value={completionMethod}
                  onChange={(event) => setCompletionMethod(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Note
                <input
                  value={completionNote}
                  onChange={(event) => setCompletionNote(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  placeholder="Optional note"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={collectDueAndComplete}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Settle Due & Complete
              </button>
              <button
                type="button"
                onClick={() => setCompletionModalOrder(null)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed right-5 top-5 z-[60]">
          <div
            className={`td-toast-enter td-toast-card min-w-[280px] max-w-[380px] rounded-xl border px-4 py-3 text-sm text-white shadow-2xl ${
              toast.type === "error"
                ? "border-amber-200/40 bg-gradient-to-r from-amber-800 to-orange-700"
                : "border-brand-200/40 bg-gradient-to-r from-brand-900 via-brand-800 to-brand-700"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/25 text-xs font-bold">
                {toast.type === "error" ? "!" : "✓"}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{toast.message}</p>
              </div>
            </div>
            <div className="td-toast-progress mt-2 h-1 rounded-full bg-white/70" />
          </div>
        </div>
      ) : null}
    </main>
  );
}
