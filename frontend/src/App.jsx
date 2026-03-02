import { useEffect, useMemo, useRef, useState } from "react";
import AppToast from "./components/AppToast";
import StickyStepActions from "./components/StickyStepActions";

const API_BASE = import.meta.env.VITE_API_URL || "";
const GARMENT_TYPES = ["Shirt", "Pant", "Suit", "Blouse", "Kurti"];
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
    ["hip", "Hip"],
    ["shoulder", "Shoulder"],
    ["sleeve", "Sleeve"],
    ["length", "Length"],
    ["cuff", "Cuff"],
    ["bicep", "Bicep"],
    ["armhole", "Armhole"]
  ],
  Pant: [
    ["waist", "Waist"],
    ["seat", "Seat"],
    ["thigh", "Thigh"],
    ["knee", "Knee"],
    ["bottom", "Bottom"],
    ["front_rise", "Front Rise"],
    ["back_rise", "Back Rise"],
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
    ["coat_length", "Coat Length"],
    ["pant_waist", "Pant Waist"],
    ["inseam", "Inseam"],
    ["pant_length", "Pant Length"]
  ],
  Blouse: [
    ["bust", "Bust"],
    ["underbust", "Under Bust"],
    ["waist", "Waist"],
    ["shoulder", "Shoulder"],
    ["sleeve", "Sleeve"],
    ["armhole", "Armhole"],
    ["neck_depth", "Neck Depth"],
    ["blouse_length", "Blouse Length"]
  ],
  Kurti: [
    ["bust", "Bust"],
    ["waist", "Waist"],
    ["hip", "Hip"],
    ["shoulder", "Shoulder"],
    ["sleeve", "Sleeve"],
    ["armhole", "Armhole"],
    ["bottom", "Bottom"],
    ["kurti_length", "Kurti Length"]
  ]
};
const MEASUREMENT_SECTION_TYPES = Object.keys(GARMENT_FIELDS);
const GARMENT_DISPLAY_LABELS = {
  Shirt: "Shirt",
  Pant: "Trouser",
  Suit: "Suit",
  Blouse: "Blouse",
  Kurti: "Kurti"
};
const APP_TITLE = "Bhavani Stitchers Tailor Desk";
const SHOP_NAME = "Bhavani Dress Designer Stitchers";
const SHOP_ADDRESS =
  "Shop No.1, H.No.17-1-382/K/1, SVR Neeladri Complex, Beside Reliance Trendz, Champapet, Hyderabad";
const SHOP_PHONE = "8465021760";

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

function getEmptyMeasurementDraftData() {
  return MEASUREMENT_SECTION_TYPES.reduce((acc, garmentType) => {
    acc[garmentType] = getEmptyMeasurementData(garmentType);
    return acc;
  }, {});
}

function normalizeMeasurementDraftData(source) {
  const input = source && typeof source === "object" ? source : {};
  return MEASUREMENT_SECTION_TYPES.reduce((acc, garmentType) => {
    acc[garmentType] = normalizeMeasurementData(garmentType, input[garmentType]);
    return acc;
  }, {});
}

function hasMeasurementValues(data) {
  if (!data || typeof data !== "object") return false;
  return Object.values(data).some((value) => String(value ?? "").trim() !== "");
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
    measurement_data: getEmptyMeasurementDraftData(),
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

function todayDisplayDate() {
  return new Date().toLocaleDateString("en-GB");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDisplayDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > 2100) return false;
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function isValidFutureOrTodayIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  return raw >= todayIsoDate();
}

function formatDateDisplay(value) {
  if (!value) return "-";
  const raw = String(value).trim();
  if (isValidDisplayDate(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB");
}

function getStepState(stepId, wizardStep, stepCompleted) {
  if (wizardStep === stepId) return "active";
  if (stepCompleted[stepId]) return "done";
  return "idle";
}

function displayGarmentType(type) {
  return GARMENT_DISPLAY_LABELS[String(type || "").trim()] || String(type || "");
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("td_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("td_user");
    return raw ? JSON.parse(raw) : null;
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapNeeded, setBootstrapNeeded] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupMobile, setSetupMobile] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
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
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeTopView, setActiveTopView] = useState("workspace");
  const [dashboardSection, setDashboardSection] = useState("overview");
  const [paymentsDashboardTab, setPaymentsDashboardTab] = useState("due");
  const [profileError, setProfileError] = useState("");
  const [profileDraft, setProfileDraft] = useState({
    name: "",
    email: "",
    mobile: "",
    current_password: "",
    new_password: "",
    confirm_password: ""
  });
  const [completionModalOrder, setCompletionModalOrder] = useState(null);
  const [completionMethod, setCompletionMethod] = useState("cash");
  const [completionNote, setCompletionNote] = useState("");
  const [deliverySlipOrder, setDeliverySlipOrder] = useState(null);
  const [unsavedPrompt, setUnsavedPrompt] = useState(null);
  const [createdOrderId, setCreatedOrderId] = useState(null);
  const [ordersModalTab, setOrdersModalTab] = useState("current");
  const [showMeasurementErrors, setShowMeasurementErrors] = useState(false);
  const [showItemErrors, setShowItemErrors] = useState(false);
  const [showPaymentErrors, setShowPaymentErrors] = useState(false);
  const [stepSaved, setStepSaved] = useState({ 2: false, 3: false, 4: false });
  const [orderDate, setOrderDate] = useState(todayDisplayDate());
  const [deliveryDate, setDeliveryDate] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [newUserDraft, setNewUserDraft] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    role: "user"
  });
  const [showUserModal, setShowUserModal] = useState(false);
  const [userModalMode, setUserModalMode] = useState("create");
  const [editingUserId, setEditingUserId] = useState(null);
  const profileMenuRef = useRef(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!token) return;
    loadSession();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (activeTopView !== "dashboard") return;
    if (dashboardSection === "users") {
      if (isAdmin) loadAdminUsers();
      return;
    }
    if (dashboardSection === "orders" || dashboardSection === "payments" || dashboardSection === "overview") {
      loadAdminOrders();
    }
  }, [token, isAdmin, activeTopView, dashboardSection]);

  useEffect(() => {
    if (!token || isAdmin) return;
    setActiveTopView("dashboard");
    setDashboardSection("orders");
  }, [token, isAdmin]);

  useEffect(() => {
    if (!showProfileMenu) return;
    function onPointerDown(event) {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    function onEsc(event) {
      if (event.key === "Escape") setShowProfileMenu(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showProfileMenu]);

  useEffect(() => {
    if (token) return;
    checkSetupStatus();
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
    setOrderDate(todayDisplayDate());
    setDeliveryDate("");
  }, [selectedId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!error) return;
    setToast({ type: "warning", message: error });
    setError("");
  }, [error]);

  useEffect(() => {
    if (!detail?.customer?.id) return;
    if (autofillCustomerId === detail.customer.id) return;

    const nextDraftData = normalizeMeasurementDraftData(
      MEASUREMENT_SECTION_TYPES.reduce((acc, garmentType) => {
        const latest = findLatestMeasurementForItemType(garmentType);
        const source =
          latest && latest.measurement_data && Object.keys(latest.measurement_data).length > 0
            ? latest.measurement_data
            : getLegacyMeasurementData(latest);
        acc[garmentType] = source;
        return acc;
      }, {})
    );

    const latestNotes =
      MEASUREMENT_SECTION_TYPES.map((garmentType) => findLatestMeasurementForItemType(garmentType)?.notes)
        .find((notes) => String(notes || "").trim()) || "";

    setMeasurementDraft((prev) => ({
      ...prev,
      measurement_data: nextDraftData,
      measurement_note: latestNotes
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

  const hasAnyMeasurementInput = useMemo(
    () =>
      MEASUREMENT_SECTION_TYPES.some((garmentType) =>
        hasMeasurementValues(measurementDraft.measurement_data[garmentType])
      ),
    [measurementDraft]
  );
  const missingMeasurementTypesForItems = useMemo(() => {
    const rows = savedMeasurements.length > 0 ? savedMeasurements : detail?.measurements || [];
    const hasSavedForType = (itemType) => {
      const target = String(itemType || "").trim().toLowerCase();
      if (!target) return false;

      const draftType = MEASUREMENT_SECTION_TYPES.find((type) => type.toLowerCase() === target);
      if (draftType && hasMeasurementValues(measurementDraft.measurement_data[draftType])) {
        return true;
      }

      return rows.some((measurement) => {
        if (String(measurement.item_type || "").trim().toLowerCase() !== target) return false;
        const data =
          measurement.measurement_data && Object.keys(measurement.measurement_data).length > 0
            ? measurement.measurement_data
            : getLegacyMeasurementData(measurement);
        return hasMeasurementValues(data);
      });
    };

    const uniqueTypes = Array.from(
      new Set(
        orderItemsWithTotals
          .map((item) => String(item.item_type || "").trim())
          .filter(Boolean)
      )
    );
    return uniqueTypes.filter((itemType) => !hasSavedForType(itemType));
  }, [savedMeasurements, detail, measurementDraft, orderItemsWithTotals]);

  const itemErrors = useMemo(
    () =>
      orderItemsWithTotals.map((item) => ({
        itemId: item.id,
        itemTypeMissing: !String(item.item_type || "").trim(),
        quantityMissing: item.quantity_num <= 0,
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

  const selectedCustomerDue = useMemo(() => {
    const orders = detail?.orders || [];
    return orders.reduce((sum, order) => {
      const totalAmount = Math.max(0, parseNumber(order.total_amount, 0));
      const paidTotal = Math.max(0, parseNumber(order.paid_total, 0));
      return sum + Math.max(0, totalAmount - paidTotal);
    }, 0);
  }, [detail]);

  const dashboardPendingCount = useMemo(
    () => adminOrders.filter((order) => order.status === "pending").length,
    [adminOrders]
  );
  const dashboardCompletedCount = useMemo(
    () => adminOrders.filter((order) => order.status === "completed").length,
    [adminOrders]
  );
  const dashboardDueTotal = useMemo(
    () =>
      adminOrders.reduce((sum, order) => {
        const totalAmount = Math.max(0, parseNumber(order.total_amount, 0));
        const paidTotal = Math.max(0, parseNumber(order.paid_total, 0));
        return sum + Math.max(0, totalAmount - paidTotal);
      }, 0),
    [adminOrders]
  );

  const stepCompleted = useMemo(
    () => ({
      2: stepSaved[2],
      3: stepSaved[3],
      4: stepSaved[4],
      5: stepSaved[2] && stepSaved[3] && stepSaved[4]
    }),
    [stepSaved]
  );
  function requestUnsavedConfirm(message, onConfirm) {
    setUnsavedPrompt({ message, onConfirm });
  }

  function navigateWizardStep(nextStep, _options = {}) {
    if (nextStep === wizardStep) {
      setWizardStep(nextStep);
      return true;
    }
    setWizardStep(nextStep);
    return true;
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

  function loadMeasurementFromHistory(measurement) {
    const garmentType =
      MEASUREMENT_SECTION_TYPES.find(
        (type) => type.toLowerCase() === String(measurement.item_type || "").trim().toLowerCase()
      ) || null;
    const source =
      measurement.measurement_data && Object.keys(measurement.measurement_data).length > 0
        ? measurement.measurement_data
        : getLegacyMeasurementData(measurement);

    if (!garmentType) {
      setMeasurementDraft((prev) => ({
        ...prev,
        measurement_note: measurement.notes || prev.measurement_note
      }));
      setStepSaved((prev) => ({ ...prev, 2: true }));
      setShowMeasurementErrors(false);
      navigateWizardStep(2, { force: true });
      return;
    }

    setMeasurementDraft((prev) => ({
      ...prev,
      measurement_data: {
        ...prev.measurement_data,
        [garmentType]: normalizeMeasurementData(garmentType, source)
      },
      measurement_note: measurement.notes || ""
    }));
    setStepSaved((prev) => ({ ...prev, 2: true }));
    setShowMeasurementErrors(false);
    navigateWizardStep(2, { force: true });
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

  function updateMeasurementField(garmentType, key, value) {
    setMeasurementDraft((prev) => ({
      ...prev,
      measurement_data: {
        ...prev.measurement_data,
        [garmentType]: {
          ...(prev.measurement_data[garmentType] || getEmptyMeasurementData(garmentType)),
          [key]: value
        }
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
      if (me.user?.role === "admin") {
        await loadCustomers();
      } else {
        setCustomers([]);
        setSelectedId(null);
        setDetail(null);
        setActiveTopView("dashboard");
        setDashboardSection("orders");
        await loadAdminOrders();
      }
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
    if (customerId !== selectedId) {
      const hasUnsaved = !stepSaved[2] || !stepSaved[3] || !stepSaved[4];
      if (hasUnsaved) {
        requestUnsavedConfirm("You have unsaved changes. Switch customer anyway?", () => {
          setSelectedId(customerId);
          navigateWizardStep(2, { force: true });
          loadCustomerDetail(customerId);
        });
        return;
      }
    }
    setSelectedId(customerId);
    navigateWizardStep(2, { force: true });
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

  async function checkSetupStatus() {
    try {
      const status = await api("/api/auth/setup-status");
      setBootstrapNeeded(Boolean(status?.needs_setup));
    } catch (_err) {
      setBootstrapNeeded(false);
    }
  }

  async function loadAdminUsers() {
    try {
      setAdminUsersLoading(true);
      const list = await api("/api/users", {}, token);
      setAdminUsers(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdminUsersLoading(false);
    }
  }

  async function loadAdminOrders() {
    try {
      setAdminOrdersLoading(true);
      const list = await api("/api/orders", {}, token);
      setAdminOrders(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdminOrdersLoading(false);
    }
  }

  function openCreateUserModal() {
    setUserModalMode("create");
    setEditingUserId(null);
    setNewUserDraft({ name: "", email: "", mobile: "", password: "", role: "user" });
    setShowUserModal(true);
  }

  function openEditUserModal(userRow) {
    setUserModalMode("edit");
    setEditingUserId(userRow.id);
    setNewUserDraft({
      name: userRow.name || "",
      email: userRow.email || "",
      mobile: userRow.mobile || "",
      password: "",
      role: userRow.role || "user"
    });
    setShowUserModal(true);
  }

  async function saveUserCredentials(event) {
    event.preventDefault();
    if (!newUserDraft.name || !newUserDraft.email) {
      setError("Name and email are required.");
      return;
    }
    if (userModalMode === "create" && !newUserDraft.password) {
      setError("Password is required for new user.");
      return;
    }

    try {
      setError("");
      if (userModalMode === "create") {
        await api(
          "/api/users",
          {
            method: "POST",
            body: JSON.stringify(newUserDraft)
          },
          token
        );
        setToast({ type: "success", message: "User created." });
      } else if (editingUserId) {
        await api(
          `/api/users/${editingUserId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              name: newUserDraft.name,
              email: newUserDraft.email,
              mobile: newUserDraft.mobile,
              role: newUserDraft.role,
              password: newUserDraft.password || undefined
            })
          },
          token
        );
        setToast({ type: "success", message: "User credentials updated." });
      }
      setShowUserModal(false);
      setNewUserDraft({ name: "", email: "", mobile: "", password: "", role: "user" });
      await loadAdminUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(userRow) {
    if (!userRow?.id) return;
    const confirmed = window.confirm(`Delete user ${userRow.name || userRow.email}?`);
    if (!confirmed) return;
    try {
      setError("");
      await api(`/api/users/${userRow.id}`, { method: "DELETE" }, token);
      setToast({ type: "success", message: "User deleted." });
      await loadAdminUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSetupAdmin(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      const data = await api("/api/auth/setup-admin", {
        method: "POST",
        body: JSON.stringify({
          name: setupName,
          email: setupEmail,
          mobile: setupMobile,
          password: setupPassword
        })
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("td_token", data.token);
      localStorage.setItem("td_user", JSON.stringify(data.user));
      setBootstrapNeeded(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setShowProfileMenu(false);
    setShowProfileModal(false);
    setToken("");
    setUser(null);
    setCustomers([]);
    setSelectedId(null);
    setDetail(null);
    localStorage.removeItem("td_token");
    localStorage.removeItem("td_user");
  }

  function openProfileModal() {
    setShowProfileMenu(false);
    setProfileError("");
    setProfileDraft({
      name: user?.name || "",
      email: user?.email || "",
      mobile: user?.mobile || "",
      current_password: "",
      new_password: "",
      confirm_password: ""
    });
    setShowProfileModal(true);
  }

  async function updateCredentials(event) {
    event.preventDefault();
    if (!profileDraft.name.trim() || !profileDraft.email.trim() || !profileDraft.current_password.trim()) {
      setProfileError("Name, email and current password are required.");
      return;
    }
    if (profileDraft.new_password && profileDraft.new_password !== profileDraft.confirm_password) {
      setProfileError("New password and confirm password must match.");
      return;
    }

    try {
      setProfileError("");
      const data = await api(
        "/api/auth/credentials",
        {
          method: "PUT",
          body: JSON.stringify({
            name: profileDraft.name,
            email: profileDraft.email,
            mobile: profileDraft.mobile,
            current_password: profileDraft.current_password,
            new_password: profileDraft.new_password || undefined
          })
        },
        token
      );
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("td_token", data.token);
      localStorage.setItem("td_user", JSON.stringify(data.user));
      setShowProfileModal(false);
      setToast({ type: "success", message: "Credentials updated." });
    } catch (err) {
      setProfileError(err.message);
    }
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

    setShowMeasurementErrors(true);
    if (!hasAnyMeasurementInput) {
      setError("Enter at least one measurement value.");
      return;
    }

    try {
      setError("");

      const payloads = MEASUREMENT_SECTION_TYPES.filter((garmentType) =>
        hasMeasurementValues(measurementDraft.measurement_data[garmentType])
      ).map((garmentType) => ({
        item_type: garmentType,
        notes: measurementDraft.measurement_note,
        measurement_data: normalizeMeasurementData(
          garmentType,
          measurementDraft.measurement_data[garmentType]
        ),
        create_order: false
      }));

      const createdRows = await Promise.all(
        payloads.map((payload) =>
          api(
            `/api/customers/${selectedId}/measurements`,
            {
              method: "POST",
              body: JSON.stringify(payload)
            },
            token
          )
        )
      );

      setSavedMeasurements((prev) => {
        const next = [...prev];
        createdRows.forEach((created) => {
          if (!next.some((item) => item.id === created.id)) {
            next.unshift(created);
          }
        });
        return next;
      });
      setStepSaved((prev) => ({ ...prev, 2: true }));
      setToast({ type: "success", message: "Measurements saved for all filled sections." });
      setShowItemErrors(false);
      navigateWizardStep(3, { force: true });
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
    if (missingMeasurementTypesForItems.length > 0) {
      setError(
        `Measurements missing for: ${missingMeasurementTypesForItems
          .map((type) => GARMENT_DISPLAY_LABELS[type] || type)
          .join(", ")}.`
      );
      return;
    }
    setError("");
    setOrderDate(todayDisplayDate());
    setStepSaved((prev) => ({ ...prev, 3: true, 4: false }));
    setToast({ type: "success", message: "Items saved." });
    setShowPaymentErrors(false);
    navigateWizardStep(4, { force: true });
  }

  function goToReviewStep() {
    setShowPaymentErrors(true);
    if (paymentSummary.advance > paymentSummary.finalTotal) {
      setError("Advance paid cannot exceed final total.");
      return;
    }
    if (!deliveryDate) {
      setError("Select delivery date.");
      return;
    }
    if (!isValidFutureOrTodayIsoDate(deliveryDate)) {
      setError("Delivery date cannot be in the past.");
      return;
    }
    setError("");
    setStepSaved((prev) => ({ ...prev, 4: true }));
    setToast({ type: "success", message: "Payment saved." });
    navigateWizardStep(5, { force: true });
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
            delivery_date: deliveryDate,
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
      navigateWizardStep(2, { force: true });
      setDeliveryDate("");
      await refreshSelected();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markOrderCompleted(orderId) {
    const orderContext =
      typeof orderId === "object" && orderId !== null ? orderId : { id: Number(orderId) };
    const targetOrderId = Number(orderContext.id);
    if (!targetOrderId) return;

    try {
      setError("");
      const updated = await api(
        `/api/orders/${targetOrderId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: "completed",
            status_note: "Completed from orders panel"
          })
        },
        token
      );
      const merged = { ...orderContext, ...updated };
      const totalAmount = Math.max(0, parseNumber(merged.total_amount, 0));
      const remainingDue = Math.max(0, parseNumber(merged.remaining_due, 0));
      const paidTotal = Math.max(0, totalAmount - remainingDue);
      setDeliverySlipOrder({
        ...merged,
        paid_total: paidTotal,
        customer_name: merged.customer_name || selectedCustomer?.name || "Customer",
        customer_phone: selectedCustomer?.phone || detail?.customer?.phone || ""
      });
      setToast({ type: "success", message: "Order marked as completed." });
      await loadAdminOrders();
      if (selectedId) await loadCustomerDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  function startOrderCompletion(order) {
    const totalAmount = Math.max(0, parseNumber(order?.total_amount, 0));
    const paidTotal = Math.max(0, parseNumber(order?.paid_total, 0));
    const due = Math.max(0, totalAmount - paidTotal);

    if (due <= 0.009) {
      markOrderCompleted(order);
      return;
    }

    setCompletionMethod("cash");
    setCompletionNote("");
    setCompletionModalOrder({ ...order, due });
  }

  async function collectDueAndComplete() {
    if (!completionModalOrder) return;

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

      const updated = await api(
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
      const merged = { ...completionModalOrder, ...updated };
      const totalAmount = Math.max(0, parseNumber(merged.total_amount, 0));
      const remainingDue = Math.max(0, parseNumber(merged.remaining_due, 0));
      const paidTotal = Math.max(0, totalAmount - remainingDue);
      setDeliverySlipOrder({
        ...merged,
        paid_total: paidTotal,
        customer_name: merged.customer_name || selectedCustomer?.name || "Customer",
        customer_phone: selectedCustomer?.phone || detail?.customer?.phone || ""
      });
      setCompletionModalOrder(null);
      setToast({
        type: "success",
        message: "Due settled. Order marked as completed."
      });
      await loadAdminOrders();
      if (selectedId) await loadCustomerDetail(selectedId);
    } catch (err) {
      setError(err.message);
    }
  }

  function printDeliverySlip(order) {
    if (!order) return;
    const customerName =
      String(
        order.customer_name ||
          order.customer?.name ||
          selectedCustomer?.name ||
          detail?.customer?.name ||
          "Customer"
      ).trim() || "Customer";
    const customerPhone =
      String(
        order.customer_phone ||
          order.customer?.phone ||
          selectedCustomer?.phone ||
          detail?.customer?.phone ||
          "-"
      ).trim() || "-";
    const totalAmount = Math.max(0, parseNumber(order.total_amount, 0));
    const advancePaid = Math.max(0, parseNumber(order.advance_paid, 0));
    const paidTotal = Math.max(0, parseNumber(order.paid_total, 0));
    const additionalPaid = Math.max(0, paidTotal - advancePaid);
    const balanceDue = Math.max(0, totalAmount - paidTotal);

    const win = window.open("", "_blank", "width=420,height=700");
    if (!win) return;

    const lines = (Array.isArray(order.items) ? order.items : [])
      .map((item) => {
        const qty = Math.max(1, parseInt(item.quantity || "1", 10) || 1);
        const itemType = displayGarmentType(item.item_type || "Item");
        const lineTotal = qty * Math.max(0, parseNumber(item.rate, 0));
        return `<tr><td>${itemType}</td><td>${qty}</td><td>${money(lineTotal)}</td></tr>`;
      })
      .join("");

    win.document.write(`
      <html>
        <head>
          <title>Delivery Slip #${order.id || ""}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 12px; color: #111; background: #fff; }
            .receipt { width: 80mm; margin: 0 auto; border: 1px solid #ddd; padding: 10px; }
            h2 { margin: 0 0 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.03em; }
            .meta { font-size: 11px; margin: 2px 0; }
            .rule { border-top: 1px dashed #999; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; }
            th, td { border-bottom: 1px solid #ddd; padding: 4px 2px; font-size: 11px; text-align: left; }
            .totals { margin-top: 8px; font-size: 11px; }
            .totals p { margin: 4px 0; display: flex; justify-content: space-between; }
            .sign { margin-top: 14px; font-size: 11px; text-align: right; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <h2>${SHOP_NAME}</h2>
            <p class="meta">${SHOP_ADDRESS}</p>
            <p class="meta">Phone: ${SHOP_PHONE}</p>
            <div class="rule"></div>
            <p class="meta">Order #: ${order.id || "-"}</p>
            <p class="meta">Customer: ${customerName}</p>
            <p class="meta">Phone: ${customerPhone}</p>
            <p class="meta">Delivery Date: ${formatDateDisplay(order.delivery_date)}</p>
            <table>
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Amount</th></tr>
              </thead>
              <tbody>${lines}</tbody>
            </table>
            <div class="totals">
              <p><span>Total</span><strong>${money(totalAmount)}</strong></p>
              <p><span>Advance Paid</span><strong>${money(advancePaid)}</strong></p>
              <p><span>Additional Paid</span><strong>${money(additionalPaid)}</strong></p>
              <p><span>Cash Received</span><strong>${money(paidTotal)}</strong></p>
              <p><span>Balance</span><strong>${money(balanceDue)}</strong></p>
            </div>
            <div class="sign">Customer Signature</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-10">
        <section className="grid w-full overflow-hidden rounded-3xl bg-white shadow-panel lg:grid-cols-2">
          <div className="bg-brand-900 p-10 text-clay">
            <p className="text-sm uppercase tracking-[0.2em] text-brand-100">Bhavani Stitchers</p>
            <h1 className="mt-4 font-display text-4xl leading-tight">{APP_TITLE}</h1>
            <p className="mt-4 max-w-sm text-sm text-brand-100">
              Client history, measurements, and orders in one panel.
            </p>
          </div>
          <form onSubmit={bootstrapNeeded ? handleSetupAdmin : handleLogin} className="space-y-4 p-10">
            <h2 className="font-display text-3xl text-ink">{bootstrapNeeded ? "Create Admin Account" : "Sign in"}</h2>
            {bootstrapNeeded ? (
              <label className="block text-sm font-semibold text-ink">
                Name
                <input
                  required
                  className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                  value={setupName}
                  onChange={(event) => setSetupName(event.target.value)}
                />
              </label>
            ) : null}
            {bootstrapNeeded ? (
              <label className="block text-sm font-semibold text-ink">
                Mobile
                <input
                  className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                  value={setupMobile}
                  onChange={(event) => setSetupMobile(event.target.value)}
                />
              </label>
            ) : null}
            <label className="block text-sm font-semibold text-ink">
              {bootstrapNeeded ? "Email" : "Email or Mobile"}
              <input
                required
                className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                value={bootstrapNeeded ? setupEmail : email}
                onChange={(event) =>
                  bootstrapNeeded ? setSetupEmail(event.target.value) : setEmail(event.target.value)
                }
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Password
              <input
                required
                type="password"
                className="mt-1 w-full rounded-xl border border-brand-300 px-3 py-2 outline-none ring-brand-500 focus:ring"
                value={bootstrapNeeded ? setupPassword : password}
                onChange={(event) =>
                  bootstrapNeeded ? setSetupPassword(event.target.value) : setPassword(event.target.value)
                }
              />
            </label>
            <button
              disabled={loading}
              className="w-full rounded-xl bg-brand-700 px-4 py-2 font-semibold text-white transition hover:bg-brand-900 disabled:opacity-50"
            >
              {loading ? "Please wait..." : bootstrapNeeded ? "Create Admin" : "Sign in"}
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
          <h1 className="font-display text-3xl">{APP_TITLE}</h1>
          <p className="text-sm text-brand-50">Signed in as {user?.name} ({user?.role})</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTopView("dashboard")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-white/40 ${
              activeTopView === "dashboard" ? "bg-white text-brand-900" : "bg-white/20 text-white"
            }`}
          >
            Dashboard
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setActiveTopView("workspace")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-white/40 ${
                activeTopView === "workspace" ? "bg-white text-brand-900" : "bg-white/20 text-white"
              }`}
            >
              Workspace
            </button>
          ) : null}
          <div ref={profileMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-white ring-1 ring-white/40"
            title="Profile"
            aria-label="Profile"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
              <path d="M4.5 19.5a7.5 7.5 0 0 1 15 0" />
            </svg>
          </button>

          {showProfileMenu ? (
            <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-brand-200 bg-white p-2 text-ink shadow-2xl">
              <button
                type="button"
                onClick={openProfileModal}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-brand-50"
              >
                Change Credentials
              </button>
              <button
                type="button"
                onClick={logout}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                Logout
              </button>
            </div>
              ) : null}
          </div>
        </div>
      </header>

      {activeTopView === "dashboard" ? (
        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="min-h-0 overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-2xl ring-1 ring-white/70 backdrop-blur">
            <h2 className="font-display text-2xl text-ink">{isAdmin ? "Admin Panel" : "User Panel"}</h2>
            {!isAdmin ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                You are a normal user. You can only view data.
              </p>
            ) : null}
            <div className="mt-3 space-y-2">
              {(isAdmin
                ? [
                    ["overview", "Overview"],
                    ["orders", "Manage Orders"],
                    ["payments", "Payments"],
                    ["customers", "Manage Customers"],
                    ["users", "Manage Users"]
                  ]
                : [["orders", "Orders"]]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDashboardSection(key)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                    dashboardSection === key ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </aside>

          <section className="flex h-full min-h-0 flex-col overflow-y-auto rounded-2xl bg-white/95 p-4 shadow-2xl ring-1 ring-white/70 backdrop-blur">
            {dashboardSection === "overview" ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Customers</p>
                  <p className="mt-2 text-3xl font-bold text-ink">{customers.length}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Orders</p>
                  <p className="mt-2 text-3xl font-bold text-ink">{dashboardPendingCount}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed Orders</p>
                  <p className="mt-2 text-3xl font-bold text-ink">{dashboardCompletedCount}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Due</p>
                  <p className="mt-2 text-3xl font-bold text-orange-700">{money(dashboardDueTotal)}</p>
                </article>
              </div>
            ) : null}

            {dashboardSection === "users" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-ink">Manage Users</h3>
                    <button
                      type="button"
                      onClick={openCreateUserModal}
                      className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Add User
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200">
                  <div className="border-b border-slate-200 px-4 py-3 font-semibold">Users</div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {adminUsersLoading ? (
                      <p className="p-4 text-sm text-slate-600">Loading users...</p>
                    ) : adminUsers.length === 0 ? (
                      <p className="p-4 text-sm text-slate-600">No users found.</p>
                    ) : (
                      adminUsers.map((row) => (
                        <div key={row.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
                          <div>
                            <p className="font-semibold text-ink">{row.name}</p>
                            <p className="text-xs text-slate-600">{row.email} {row.mobile ? `| ${row.mobile}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {row.role}
                            </span>
                            <button
                              type="button"
                              onClick={() => openEditUserModal(row)}
                              className="rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-900"
                            >
                              Modify
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteUser(row)}
                              className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {dashboardSection === "customers" ? (
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-ink">Customers</h3>
                <p className="text-sm text-slate-600">Use Workspace for full customer/order flow.</p>
                <div className="max-h-[470px] overflow-y-auto rounded-xl border border-slate-200">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        selectCustomer(customer.id);
                        setActiveTopView("workspace");
                      }}
                      className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2 text-left text-sm hover:bg-brand-50"
                    >
                      <span className="font-semibold text-ink">{customer.name}</span>
                      <span className="text-xs text-slate-600">{customer.phone || "No phone"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {dashboardSection === "orders" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <h3 className="text-lg font-bold text-ink">Orders</h3>
                <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-2">
                  <div className="flex min-h-0 flex-col rounded-xl border border-orange-200 bg-orange-50/60 p-3">
                    <h4 className="text-sm font-bold text-orange-700">Pending Orders</h4>
                    <div className="mt-2 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                      {adminOrdersLoading ? (
                        <p className="text-sm text-slate-600">Loading orders...</p>
                      ) : adminOrders.filter((order) => order.status === "pending").length === 0 ? (
                        <p className="text-sm text-slate-600">No pending orders.</p>
                      ) : (
                        adminOrders
                          .filter((order) => order.status === "pending")
                          .map((order) => (
                            <div key={order.id} className="rounded-xl border border-orange-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-ink">#{order.id} {order.customer_name}</p>
                                {isAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => startOrderCompletion(order)}
                                    className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                                  >
                                    Mark Completed
                                  </button>
                                ) : null}
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Total</p>
                                  <p className="font-semibold text-ink">{money(order.total_amount)}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Paid</p>
                                  <p className="font-semibold text-ink">{money(order.paid_total)}</p>
                                </div>
                                <div className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5">
                                  <p className="text-orange-600">Due</p>
                                  <p className="font-semibold text-orange-700">
                                    {money(
                                      Math.max(0, parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0))
                                    )}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Order Taken</p>
                                  <p className="font-semibold text-ink">{formatDateDisplay(order.created_at)}</p>
                                </div>
                                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Delivery</p>
                                  <p className="font-semibold text-ink">
                                    {order.delivery_date ? formatDateDisplay(order.delivery_date) : "Not set"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <h4 className="text-sm font-bold text-emerald-700">Completed Orders</h4>
                    <div className="mt-2 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                      {adminOrdersLoading ? (
                        <p className="text-sm text-slate-600">Loading orders...</p>
                      ) : adminOrders.filter((order) => order.status === "completed").length === 0 ? (
                        <p className="text-sm text-slate-600">No completed orders.</p>
                      ) : (
                        adminOrders
                          .filter((order) => order.status === "completed")
                          .map((order) => (
                            <div key={order.id} className="rounded-xl border border-emerald-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-ink">#{order.id} {order.customer_name}</p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    printDeliverySlip({
                                      ...order,
                                      customer_phone: detail?.customer?.phone || ""
                                    })
                                  }
                                  className="rounded-lg bg-brand-700 px-2 py-1 text-xs font-semibold text-white"
                                >
                                  Print Slip
                                </button>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Total</p>
                                  <p className="font-semibold text-ink">{money(order.total_amount)}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Paid</p>
                                  <p className="font-semibold text-ink">{money(order.paid_total)}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Order Taken</p>
                                  <p className="font-semibold text-ink">{formatDateDisplay(order.created_at)}</p>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                                  <p className="text-emerald-600">Delivered</p>
                                  <p className="font-semibold text-emerald-700">
                                    {order.delivery_date ? formatDateDisplay(order.delivery_date) : "Not set"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {dashboardSection === "payments" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <h3 className="text-lg font-bold text-ink">Payments / Due Tracker</h3>
                <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-2">
                  <div className="flex min-h-0 flex-col rounded-xl border border-orange-200 bg-orange-50/60 p-3">
                    <h4 className="text-sm font-bold text-orange-700">Due</h4>
                    <div className="mt-2 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                      {adminOrdersLoading ? (
                        <p className="text-sm text-slate-600">Loading payment data...</p>
                      ) : adminOrders.filter((order) => {
                          const due = Math.max(0, parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0));
                          return due > 0;
                        }).length === 0 ? (
                        <p className="text-sm text-slate-600">No due payments.</p>
                      ) : (
                        adminOrders
                          .filter((order) => {
                            const due = Math.max(0, parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0));
                            return due > 0;
                          })
                          .map((order) => {
                            const due = Math.max(
                              0,
                              parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0)
                            );
                            return (
                              <div key={order.id} className="rounded-xl border border-orange-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-semibold text-ink">#{order.id} {order.customer_name}</p>
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                    Due
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                    <p className="text-slate-500">Paid</p>
                                    <p className="font-semibold text-ink">{money(order.paid_total)}</p>
                                  </div>
                                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5">
                                    <p className="text-orange-600">Remaining Due</p>
                                    <p className="font-semibold text-orange-700">{money(due)}</p>
                                  </div>
                                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                    <p className="text-slate-500">Order Taken</p>
                                    <p className="font-semibold text-ink">{formatDateDisplay(order.created_at)}</p>
                                  </div>
                                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                    <p className="text-slate-500">Delivery</p>
                                    <p className="font-semibold text-ink">
                                      {order.delivery_date ? formatDateDisplay(order.delivery_date) : "Not set"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <h4 className="text-sm font-bold text-emerald-700">Settled / Delivered</h4>
                    <div className="mt-2 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                      {adminOrdersLoading ? (
                        <p className="text-sm text-slate-600">Loading payment data...</p>
                      ) : adminOrders.filter((order) => {
                          const due = Math.max(0, parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0));
                          return due <= 0;
                        }).length === 0 ? (
                        <p className="text-sm text-slate-600">No settled payments.</p>
                      ) : (
                        adminOrders
                          .filter((order) => {
                            const due = Math.max(0, parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0));
                            return due <= 0;
                          })
                          .map((order) => (
                            <div key={order.id} className="rounded-xl border border-emerald-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-ink">#{order.id} {order.customer_name}</p>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  Settled
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Paid</p>
                                  <p className="font-semibold text-ink">{money(order.paid_total)}</p>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                                  <p className="text-emerald-600">Remaining Due</p>
                                  <p className="font-semibold text-emerald-700">{money(0)}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Order Taken</p>
                                  <p className="font-semibold text-ink">{formatDateDisplay(order.created_at)}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <p className="text-slate-500">Delivery</p>
                                  <p className="font-semibold text-ink">
                                    {order.delivery_date ? formatDateDisplay(order.delivery_date) : "Not set"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      ) : (
        <>
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
                                onClick={() => navigateWizardStep(step.id)}
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
                      <h3 className="text-lg font-bold text-ink">
                        Step 1: Measurements {stepCompleted[2] ? "✓" : ""}
                      </h3>
                      <p className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-[11px] text-slate-700">
                        Fill measurements directly for all garment types. Previously saved values are auto-filled.
                      </p>

                      <div className="space-y-2">
                        {MEASUREMENT_SECTION_TYPES.map((garmentType) => (
                          <div
                            key={garmentType}
                            className={`group relative overflow-hidden rounded-xl border bg-gradient-to-r from-white via-white to-slate-50 p-2.5 shadow-sm transition-all ${
                              showMeasurementErrors && !hasAnyMeasurementInput
                                ? "border-red-300"
                                : "border-slate-200 hover:border-brand-300 hover:shadow-md"
                            }`}
                          >
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-500/70 to-brand-300/70" />
                            <div className="flex items-center gap-1.5">
                              <div className="w-24 shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700">
                                  {GARMENT_DISPLAY_LABELS[garmentType] || garmentType}
                              </div>
                              <div className="flex flex-1 flex-nowrap items-end gap-1 overflow-x-auto pb-0.5">
                                {getFieldsForGarment(garmentType).map(([fieldKey, label]) => (
                                  <label
                                    key={`${garmentType}-${fieldKey}`}
                                    className="w-[60px] shrink-0 space-y-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500"
                                  >
                                    <span>{label}</span>
                                    <input
                                      value={measurementDraft.measurement_data[garmentType]?.[fieldKey] || ""}
                                      onChange={(event) =>
                                        updateMeasurementField(garmentType, fieldKey, event.target.value)
                                      }
                                      className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-medium normal-case text-ink shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring"
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}

                        <label className="space-y-0.5 rounded-lg border border-slate-200 bg-white p-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">
                          <span>Detail</span>
                          <input
                            placeholder="Additional note"
                            value={measurementDraft.measurement_note}
                            onChange={(event) =>
                              setMeasurementDraft((prev) => ({ ...prev, measurement_note: event.target.value }))
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium normal-case text-ink shadow-sm outline-none ring-brand-400 transition focus:border-brand-400 focus:ring"
                          />
                        </label>
                      </div>
                      {showMeasurementErrors && !hasAnyMeasurementInput ? (
                        <p className="text-xs font-semibold text-red-600">
                          Enter at least one measurement value to continue.
                        </p>
                      ) : null}

                      <StickyStepActions>
                        <button
                          type="button"
                          onClick={saveMeasurement}
                          className="rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white shadow-lg shadow-brand-700/30"
                        >
                          Save & Next
                        </button>
                      </StickyStepActions>
                    </div>
                  ) : null}

                  {wizardStep === 3 ? (
                    <div className="h-[520px] space-y-4 overflow-y-auto rounded-2xl border border-brand-100 bg-gradient-to-b from-white to-brand-50/30 p-4 text-sm shadow-inner">
                      <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                        <h3 className="text-lg font-bold text-ink">
                          Step 2: Items {stepCompleted[3] ? "✓" : ""}
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-700">
                          Add one or more items. Subtotal is auto-calculated.
                        </p>
                      </div>

                      <div className="space-y-2">
                        {orderItemsWithTotals.map((item) => (
                          <div key={item.id} className="relative grid grid-cols-12 gap-2 rounded-xl border border-brand-100 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow-md">
                            <div className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl bg-brand-300/70" />
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
                                  {GARMENT_DISPLAY_LABELS[type] || type}
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

                      <StickyStepActions>
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
                          onClick={() => navigateWizardStep(2)}
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
                      </StickyStepActions>

                      <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subtotal</p>
                        <p className="text-base font-bold text-ink">{money(subtotal)}</p>
                      </div>
                      {showItemErrors && (hasItemErrors || subtotal <= 0) ? (
                        <p className="text-xs font-semibold text-red-600">
                          Fill item type, quantity, and rate for each row. Subtotal must be greater than 0.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {wizardStep === 4 ? (
                    <div className="h-[520px] space-y-4 overflow-y-auto rounded-2xl border border-brand-100 bg-gradient-to-b from-white to-brand-50/30 p-4 text-sm shadow-inner">
                      <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                        <h3 className="text-lg font-bold text-ink">
                          Step 3: Payments {stepCompleted[4] ? "✓" : ""}
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-700">Confirm payment and delivery details.</p>
                      </div>

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

                        <label className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs text-slate-500">Delivery Date</p>
                          <input
                            type="date"
                            value={deliveryDate}
                            min={todayIsoDate()}
                            onChange={(event) => setDeliveryDate(event.target.value)}
                            className={`mt-1 w-full rounded-lg border bg-white px-2 py-1.5 text-sm font-medium outline-none ring-brand-400 focus:ring ${
                              showPaymentErrors && (!deliveryDate || !isValidFutureOrTodayIsoDate(deliveryDate))
                                ? "border-red-400"
                                : "border-brand-200"
                            }`}
                          />
                        </label>

                        <input
                          placeholder="Order Note"
                          value={paymentDraft.notes}
                          onChange={(event) => setPaymentDraft((prev) => ({ ...prev, notes: event.target.value }))}
                          className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none ring-brand-400 focus:ring"
                        />
                      </div>
                      {showPaymentErrors && paymentSummary.advance > paymentSummary.finalTotal ? (
                        <p className="text-xs font-semibold text-red-600">Advance cannot exceed final total.</p>
                      ) : null}
                      {showPaymentErrors && !deliveryDate ? (
                        <p className="text-xs font-semibold text-red-600">
                          Delivery date is required.
                        </p>
                      ) : null}
                      {showPaymentErrors && deliveryDate && !isValidFutureOrTodayIsoDate(deliveryDate) ? (
                        <p className="text-xs font-semibold text-red-600">
                          Delivery date cannot be in the past.
                        </p>
                      ) : null}

                      <StickyStepActions>
                        <button
                          type="button"
                          onClick={() => navigateWizardStep(3)}
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
                      </StickyStepActions>
                    </div>
                  ) : null}

                  {wizardStep === 5 ? (
                    <div className="h-[520px] space-y-4 overflow-y-auto rounded-2xl border border-brand-100 bg-gradient-to-b from-white to-brand-50/30 p-4 text-sm shadow-inner">
                      <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                        <h3 className="text-lg font-bold text-ink">
                          Step 4: Review {stepCompleted[5] ? "✓" : ""}
                        </h3>
                        <p className="mt-1 text-[11px] text-slate-700">Review all details before creating order.</p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-600">Customer</p>
                          <p className="font-semibold text-ink">{selectedCustomer.name}</p>
                          <p className="text-xs text-slate-600">{selectedCustomer.phone || "No phone"}</p>
                        </div>

                        <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-600">Order Date</p>
                          <p className="font-semibold text-ink">{orderDate}</p>
                        </div>

                        <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                          <p className="text-xs font-semibold text-slate-600">Delivery Date</p>
                          <p className="font-semibold text-ink">{formatDateDisplay(deliveryDate)}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
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

                      <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                        <p className="text-xs font-semibold text-slate-600">Items</p>
                        {orderItemsWithTotals.map((item) => (
                          <p key={item.id} className="text-xs text-slate-700">
                            {item.quantity_num} x {item.item_type} x {money(item.rate_num)} = {money(item.line_total)}
                          </p>
                        ))}
                        <p className="mt-2 text-sm font-semibold text-ink">Subtotal: {money(subtotal)}</p>
                      </div>

                      <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-sm">
                        <p className="text-xs font-semibold text-slate-600">Payment</p>
                        <p className="text-xs text-slate-700">Final Total: {money(paymentSummary.finalTotal)}</p>
                        <p className="text-xs text-slate-700">Advance Paid: {money(paymentSummary.advance)}</p>
                        <p className="text-xs font-semibold text-ink">Balance: {money(paymentSummary.balance)}</p>
                      </div>

                      <StickyStepActions>
                        <button
                          type="button"
                          onClick={() => navigateWizardStep(4)}
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
                      </StickyStepActions>
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
        </>
      )}

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
                        ) : ordersModalTab === "completed" ? (
                          <button
                            type="button"
                            onClick={() =>
                              printDeliverySlip({
                                ...order,
                                customer_phone: detail?.customer?.phone || ""
                              })
                            }
                            className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Print Slip
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                          <p className="text-slate-500">Total</p>
                          <p className="font-semibold text-ink">{money(order.total_amount)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                          <p className="text-slate-500">Paid</p>
                          <p className="font-semibold text-ink">{money(order.paid_total)}</p>
                        </div>
                        {ordersModalTab === "current" ? (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5">
                            <p className="text-orange-600">Due</p>
                            <p className="font-semibold text-orange-700">
                              {money(
                                Math.max(0, parseNumber(order.total_amount, 0) - parseNumber(order.paid_total, 0))
                              )}
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                            <p className="text-emerald-600">Status</p>
                            <p className="font-semibold text-emerald-700">Settled</p>
                          </div>
                        )}
                        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                          <p className="text-slate-500">Order Taken</p>
                          <p className="font-semibold text-ink">{formatDateDisplay(order.created_at)}</p>
                        </div>
                        <div className="col-span-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                          <p className="text-slate-500">Delivered Date</p>
                          <p className="font-semibold text-ink">
                            {order.delivery_date ? formatDateDisplay(order.delivery_date) : "Not set"}
                          </p>
                        </div>
                      </div>
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

      {deliverySlipOrder ? (
        <div className="fixed inset-0 z-[67] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">Customer Delivery Slip</h3>
            <p className="mt-1 text-sm text-slate-700">Final handover copy for completed order. Reprint anytime.</p>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                <span className="font-semibold">Order:</span> #{deliverySlipOrder.id}
              </p>
              <p>
                <span className="font-semibold">Customer:</span> {deliverySlipOrder.customer_name || "Customer"}
              </p>
              <p>
                <span className="font-semibold">Phone:</span> {deliverySlipOrder.customer_phone || "-"}
              </p>
              <p>
                <span className="font-semibold">Delivery Date:</span>{" "}
                {formatDateDisplay(deliverySlipOrder.delivery_date)}
              </p>
            </div>

            <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-xs">
              {(Array.isArray(deliverySlipOrder.items) ? deliverySlipOrder.items : []).map((item) => {
                const qty = Math.max(1, parseInt(item.quantity || "1", 10) || 1);
                const rate = Math.max(0, parseNumber(item.rate, 0));
                return (
                  <p key={`delivery-slip-item-${item.id || item.item_type}`}>
                    {qty} x {displayGarmentType(item.item_type)} x {money(rate)} = {money(qty * rate)}
                  </p>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-slate-500">Total</p>
                <p className="font-semibold text-ink">{money(deliverySlipOrder.total_amount)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-slate-500">Cash Received</p>
                <p className="font-semibold text-ink">{money(deliverySlipOrder.paid_total)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-slate-500">Balance</p>
                <p className="font-semibold text-ink">
                  {money(
                    Math.max(
                      0,
                      parseNumber(deliverySlipOrder.total_amount, 0) -
                        parseNumber(deliverySlipOrder.paid_total, 0)
                    )
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => printDeliverySlip(deliverySlipOrder)}
                className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Print Slip
              </button>
              <button
                type="button"
                onClick={() => setDeliverySlipOrder(null)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unsavedPrompt ? (
        <div className="fixed inset-0 z-[68] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-display text-xl text-ink">Unsaved Changes</h3>
            <p className="mt-2 text-sm text-slate-700">{unsavedPrompt.message}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const action = unsavedPrompt.onConfirm;
                  setUnsavedPrompt(null);
                  if (typeof action === "function") action();
                }}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => setUnsavedPrompt(null)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                Stay Here
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUserModal ? (
        <div className="fixed inset-0 z-[66] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">
              {userModalMode === "create" ? "Add User" : "Modify Credentials"}
            </h3>
            <form onSubmit={saveUserCredentials} className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Name
                <input
                  required
                  value={newUserDraft.name}
                  onChange={(event) => setNewUserDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Email
                <input
                  required
                  value={newUserDraft.email}
                  onChange={(event) => setNewUserDraft((prev) => ({ ...prev, email: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Mobile
                <input
                  value={newUserDraft.mobile}
                  onChange={(event) => setNewUserDraft((prev) => ({ ...prev, mobile: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Role
                <select
                  value={newUserDraft.role}
                  onChange={(event) => setNewUserDraft((prev) => ({ ...prev, role: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {userModalMode === "create" ? "Password" : "New Password (Optional)"}
                <input
                  type="password"
                  required={userModalMode === "create"}
                  value={newUserDraft.password}
                  onChange={(event) => setNewUserDraft((prev) => ({ ...prev, password: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <div className="sm:col-span-2 mt-1 flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  {userModalMode === "create" ? "Create User" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showProfileModal ? (
        <div className="fixed inset-0 z-[66] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-display text-2xl text-ink">Change Credentials</h3>
            <form onSubmit={updateCredentials} className="mt-3 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Name
                <input
                  required
                  value={profileDraft.name}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Email
                <input
                  required
                  value={profileDraft.email}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, email: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Mobile
                <input
                  value={profileDraft.mobile}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, mobile: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Current Password
                <input
                  required
                  type="password"
                  value={profileDraft.current_password}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({ ...prev, current_password: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                New Password
                <input
                  type="password"
                  value={profileDraft.new_password}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({ ...prev, new_password: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                Confirm New Password
                <input
                  type="password"
                  value={profileDraft.confirm_password}
                  onChange={(event) =>
                    setProfileDraft((prev) => ({ ...prev, confirm_password: event.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                />
              </label>
              {profileError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {profileError}
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Save Credentials
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setProfileError("");
                  }}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <AppToast toast={toast} />
    </main>
  );
}
