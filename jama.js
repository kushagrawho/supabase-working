
const JAMA_STORAGE_KEY = "bizpilot_jama_udhar_v1";
const JAMA_SETTLEMENT_STORAGE_KEY = "bizpilot_jama_udhar_settlements_v1";
const JAMA_NEXT_ID_KEY = "bizpilot_jama_next_id";
const JAMA_CUSTOMERS_KEY = "bizpilot_customers_v1";

// Load Jama/Udhar records
function loadJamaUdharRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(JAMA_STORAGE_KEY));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

// Save Jama/Udhar records
function saveJamaUdharRecords(records) {
  localStorage.setItem(JAMA_STORAGE_KEY, JSON.stringify(records));
}

// Load settlement history
function loadJamaSettlements() {
  try {
    const records = JSON.parse(
      localStorage.getItem(JAMA_SETTLEMENT_STORAGE_KEY)
    );
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

// Load registered customers
function loadJamaCustomers() {
  try {
    const records = JSON.parse(localStorage.getItem(JAMA_CUSTOMERS_KEY));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

// Escape displayed text
function escapeJamaHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// Local date in YYYY-MM-DD format
function getJamaLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Format date for display
function formatJamaDate(value) {
  if (!value) return "—";

  const date = new Date(value + "T00:00:00");

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// Format an amount with its Jama/Udhar sign
function formatJamaSignedAmount(type, amount) {
  const formatted = "₹" + Number(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });

  return type === "jama" ? "−" + formatted : "+" + formatted;
}

// Generate unique Jama/Udhar transaction IDs
function generateJamaTransactionId() {
  const nextNumber = Math.max(
    1,
    Number(localStorage.getItem(JAMA_NEXT_ID_KEY)) || 1
  );

  localStorage.setItem(JAMA_NEXT_ID_KEY, String(nextNumber + 1));

  return "JU" + String(nextNumber).padStart(5, "0");
}

// Find customer using the unique mobile number
function findJamaCustomer(mobile) {
  return loadJamaCustomers().find(
    customer => customer.mobile === mobile
  ) || null;
}

// Add a new Jama or Udhar transaction.
// Other modules can also call this function later.
function addJamaUdharEntry(details) {
  const mobile = String(details.customerMobile || "").trim();
  const type = String(details.type || "").toLowerCase();
  const amount = Number(details.amount);
  const date = String(details.date || "");

  if (!/^[0-9]{10}$/.test(mobile)) {
    throw new Error("A valid 10-digit customer mobile number is required.");
  }

  const customer = findJamaCustomer(mobile);

  if (!customer) {
    throw new Error("Customer not found. Register the customer first.");
  }

  if (type !== "jama" && type !== "udhar") {
    throw new Error("Transaction type must be Jama or Udhar.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  if (!date || Number.isNaN(new Date(date + "T00:00:00").getTime())) {
    throw new Error("A valid transaction date is required.");
  }

  const records = loadJamaUdharRecords();

  const record = {
    transactionId: generateJamaTransactionId(),
    customerMobile: customer.mobile,
    customerName: customer.name,
    type: type,
    originalAmount: amount,
    remainingAmount: amount,
    date: date,
    notes: String(details.notes || "").trim(),
    source: String(details.source || "manual"),
    reference: String(details.reference || ""),
    createdAt: new Date().toISOString()
  };

  records.push(record);
  saveJamaUdharRecords(records);

  return record;
}

// Apply a settlement to existing outstanding Jama or Udhar.
// balanceType "udhar" reduces money owed by the customer.
// balanceType "jama" consumes the customer's advance.
//
// Older outstanding transactions are settled first (FIFO).
// This function will be used by Cash/UPI and Sales later.
function applyJamaUdharSettlement(details) {
  const mobile = String(details.customerMobile || "").trim();
  const balanceType = String(details.balanceType || "").toLowerCase();
  const amount = Number(details.amount);
  const date = String(details.date || getJamaLocalDate());

  if (!/^[0-9]{10}$/.test(mobile)) {
    throw new Error("A valid customer mobile number is required.");
  }

  if (balanceType !== "jama" && balanceType !== "udhar") {
    throw new Error("Settlement type must be Jama or Udhar.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Settlement amount must be greater than zero.");
  }

  if (!findJamaCustomer(mobile)) {
    throw new Error("Customer not found.");
  }

  const records = loadJamaUdharRecords();

  const eligibleRecords = records
    .filter(record =>
      record.customerMobile === mobile &&
      record.type === balanceType &&
      Number(record.remainingAmount) > 0
    )
    .sort((a, b) => {
      const dateDifference = a.date.localeCompare(b.date);

      return dateDifference !== 0
        ? dateDifference
        : a.transactionId.localeCompare(b.transactionId);
    });

  let amountLeft = amount;
  let appliedAmount = 0;
  const allocations = [];

  for (const record of eligibleRecords) {
    if (amountLeft <= 0) break;

    const outstanding = Number(record.remainingAmount);
    const amountToApply = Math.min(outstanding, amountLeft);

    record.remainingAmount = Number(
      (outstanding - amountToApply).toFixed(2)
    );

    if (record.remainingAmount < 0.005) {
      record.remainingAmount = 0;
    }

    amountLeft = Number((amountLeft - amountToApply).toFixed(2));
    appliedAmount = Number((appliedAmount + amountToApply).toFixed(2));

    allocations.push({
      transactionId: record.transactionId,
      amount: amountToApply
    });
  }

  if (appliedAmount > 0) {
    const settlement = {
      settlementId: "JUS" + Date.now() + Math.floor(Math.random() * 1000),
      customerMobile: mobile,
      customerName: findJamaCustomer(mobile).name,
      balanceType: balanceType,
      amount: appliedAmount,
      date: date,
      source: String(details.source || "external"),
      reference: String(details.reference || ""),
      allocations: allocations,
      createdAt: new Date().toISOString()
    };

    const oldRecords = localStorage.getItem(JAMA_STORAGE_KEY);
    const settlements = loadJamaSettlements();

    settlements.push(settlement);

    try {
      saveJamaUdharRecords(records);
      localStorage.setItem(
        JAMA_SETTLEMENT_STORAGE_KEY,
        JSON.stringify(settlements)
      );
    } catch (error) {
      if (oldRecords === null) {
        localStorage.removeItem(JAMA_STORAGE_KEY);
      } else {
        localStorage.setItem(JAMA_STORAGE_KEY, oldRecords);
      }

      throw new Error("Settlement could not be saved.");
    }
  }

  return {
    appliedAmount: appliedAmount,
    unappliedAmount: amountLeft,
    allocations: allocations
  };
}

// Calculate current Jama and Udhar balances
function getJamaUdharTotals() {
  const records = loadJamaUdharRecords();

  const totals = records.reduce((result, record) => {
    const remaining = Number(record.remainingAmount || 0);

    if (record.type === "udhar") {
      result.udhar += remaining;
    }

    if (record.type === "jama") {
      result.jama += remaining;
    }

    return result;
  }, {
    jama: 0,
    udhar: 0
  });

  totals.jama = Number(totals.jama.toFixed(2));
  totals.udhar = Number(totals.udhar.toFixed(2));

  return totals;
}

// Display the Jama/Udhar page
function renderJamaPage() {
  const records = loadJamaUdharRecords();
  const totals = getJamaUdharTotals();

  const rows = records.length
    ? records.slice().reverse().map(record => {
        const remaining = Number(record.remainingAmount || 0);
        const cleared = remaining <= 0;

        return `
          <tr data-jama-row>
            <td>${escapeJamaHTML(record.transactionId)}</td>
            <td>${formatJamaDate(record.date)}</td>
            <td>${escapeJamaHTML(record.customerMobile)}</td>
            <td>${escapeJamaHTML(record.customerName)}</td>
            <td>
              <span class="jama-type ${record.type}">
                ${record.type === "jama" ? "Jama" : "Udhar"}
              </span>
            </td>
            <td>
              <strong class="${record.type === "jama" ? "jama-negative" : "jama-positive"}">
                ${formatJamaSignedAmount(record.type, remaining)}
              </strong>
            </td>
            <td>
              <span class="jama-status ${cleared ? "cleared" : "uncleared"}">
                ${cleared ? "Cleared" : "Uncleared"}
              </span>
            </td>
            <td>
              ${escapeJamaHTML(record.notes || "—")}
            </td>
          </tr>
        `;
      }).join("")
    : `
        <tr>
          <td colspan="8" class="empty-note">
            No Jama/Udhar transactions yet. Add your first entry below.
          </td>
        </tr>
      `;

  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-top">Total uncleared Udhar</div>
        <div class="stat-value jama-positive">
          ${"₹" + totals.udhar.toLocaleString("en-IN")}
        </div>
        <div class="stat-foot">Amount customers owe your business</div>
      </div>

      <div class="stat-card">
        <div class="stat-top">Total uncleared Jama</div>
        <div class="stat-value jama-negative">
          ${"₹" + totals.jama.toLocaleString("en-IN")}
        </div>
        <div class="stat-foot">
          Outstanding customer advances; committee payouts will be included in the Committee step.
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Jama / Udhar records</h3>
          <div class="panel-sub">
            Jama is displayed as negative and Udhar as positive.
          </div>
        </div>

        <button type="button" class="muted-link" id="jamaExport">
          Export CSV ↓
        </button>
      </div>

      <div class="module-toolbar">
        <input
          type="search"
          class="search-input"
          id="jamaSearch"
          placeholder="Search by transaction, mobile or customer name..."
        />

        <span class="panel-sub">
          ${records.length} transactions
        </span>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Date</th>
              <th>Customer mobile</th>
              <th>Customer name</th>
              <th>Type</th>
              <th>Remaining amount</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>

          <tbody id="jamaTableBody">
            ${rows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Add Jama / Udhar entry</h3>
          <div class="panel-sub">
            Enter the customer's registered mobile number.
          </div>
        </div>
      </div>

      <form id="jamaForm" class="jama-form">

        <div class="jama-field">
          <label for="jamaCustomerMobile">Customer mobile number</label>
          <input
            type="tel"
            id="jamaCustomerMobile"
            name="customerMobile"
            maxlength="10"
            pattern="[0-9]{10}"
            inputmode="numeric"
            placeholder="Enter registered mobile number"
            required
          />
          <small id="jamaCustomerLookupStatus" class="jama-help">
            Enter a registered customer mobile number.
          </small>
        </div>

        <div class="jama-field">
          <label for="jamaCustomerName">Customer name</label>
          <input
            type="text"
            id="jamaCustomerName"
            class="search-input"
            placeholder="Customer name will appear here"
            readonly
          />
        </div>

        <div class="jama-field">
          <label for="jamaType">Transaction type</label>
          <select
            id="jamaType"
            name="type"
            class="search-input"
            required
          >
            <option value="">Select type</option>
            <option value="jama">Jama (Advance received)</option>
            <option value="udhar">Udhar (Credit given)</option>
          </select>
        </div>

        <div class="jama-field">
          <label for="jamaAmount">Amount (₹)</label>
          <input
            type="number"
            id="jamaAmount"
            name="amount"
            class="search-input"
            min="0.01"
            step="0.01"
            placeholder="Enter amount"
            required
          />
          <small class="jama-help">
            Enter a positive number. The table applies the correct sign.
          </small>
        </div>

        <div class="jama-field">
          <label for="jamaDate">Transaction date</label>
          <input
            type="date"
            id="jamaDate"
            name="date"
            class="search-input"
            value="${getJamaLocalDate()}"
            required
          />
        </div>

        <div class="jama-field">
          <label for="jamaNotes">Details (optional)</label>
          <input
            type="text"
            id="jamaNotes"
            name="notes"
            class="search-input"
            placeholder="Example: Advance for next purchase"
            maxlength="200"
          />
        </div>

        <div class="jama-form-actions">
          <button type="submit" class="small-button">
            + Save transaction
          </button>
        </div>

      </form>

      <p class="panel-sub jama-note">
        Each entry is saved separately. Its remaining amount and status
        will change when a linked settlement is recorded through Cash/UPI
        or Sales.
      </p>
    </div>
  `;
}


// Look up customer name when mobile number is entered
document.addEventListener("input", function(event) {
  if (event.target.id !== "jamaCustomerMobile") return;

  const mobile = event.target.value.trim();
  const nameInput = document.getElementById("jamaCustomerName");
  const status = document.getElementById("jamaCustomerLookupStatus");

  if (!nameInput || !status) return;

  nameInput.value = "";

  if (!/^[0-9]{10}$/.test(mobile)) {
    status.textContent = "Enter the registered 10-digit mobile number.";
    status.className = "jama-help";
    return;
  }

  const customer = findJamaCustomer(mobile);

  if (!customer) {
    status.textContent = "Customer not found. Add the customer first.";
    status.className = "jama-help jama-error";
    return;
  }

  nameInput.value = customer.name;
  status.textContent = "Customer found.";
  status.className = "jama-help jama-success";
});


// Save a new Jama or Udhar entry
document.addEventListener("submit", function(event) {
  if (event.target.id !== "jamaForm") return;

  event.preventDefault();

  const form = event.target;

  try {
    const record = addJamaUdharEntry({
      customerMobile: form.elements.customerMobile.value,
      type: form.elements.type.value,
      amount: form.elements.amount.value,
      date: form.elements.date.value,
      notes: form.elements.notes.value,
      source: "manual"
    });

    render("jama");
    toast(
      record.type === "jama"
        ? "Jama entry saved successfully."
        : "Udhar entry saved successfully."
    );
  } catch (error) {
    toast(error.message || "Could not save the transaction.");
  }
});


// Search Jama/Udhar records
document.addEventListener("input", function(event) {
  if (event.target.id !== "jamaSearch") return;

  const searchText = event.target.value.toLowerCase();

  document.querySelectorAll("[data-jama-row]").forEach(row => {
    row.style.display =
      row.textContent.toLowerCase().includes(searchText) ? "" : "none";
  });
});


// Export Jama/Udhar records
document.addEventListener("click", function(event) {
  if (event.target.id !== "jamaExport") return;

  const records = loadJamaUdharRecords();

  const headers = [
    "Transaction ID",
    "Date",
    "Customer mobile",
    "Customer name",
    "Type",
    "Original amount",
    "Remaining amount",
    "Signed remaining amount",
    "Status",
    "Details"
  ];

  const rows = records.map(record => {
    const remaining = Number(record.remainingAmount || 0);

    return [
      record.transactionId,
      record.date,
      record.customerMobile,
      record.customerName,
      record.type,
      record.originalAmount,
      remaining,
      record.type === "jama" ? -remaining : remaining,
      remaining <= 0 ? "Cleared" : "Uncleared",
      record.notes || ""
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "jama-udhar.csv";
  link.click();

  URL.revokeObjectURL(url);

  toast("Jama/Udhar CSV exported.");
});
