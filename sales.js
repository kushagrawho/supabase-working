// ==========================================
// SALES MANAGEMENT
// Multi-item invoices + payment integration
// ==========================================

const SALES_STORAGE_KEY = "bizpilot_sales_v1";
const SALES_INVENTORY_STORAGE_KEY = "bizpilot_inventory_v1";
const SALES_CUSTOMER_STORAGE_KEY = "bizpilot_customers_v1";

const SALES_CASH_STORAGE_KEY = "bizpilot_cash_bank_v1";
const SALES_JAMA_STORAGE_KEY = "bizpilot_jama_udhar_v1";
const SALES_JAMA_SETTLEMENTS_KEY = "bizpilot_jama_udhar_settlements_v1";
const SALES_JAMA_NEXT_ID_KEY = "bizpilot_jama_next_id";


// ==========================================
// 1. STORAGE FUNCTIONS
// ==========================================

function loadSales() {
  try {
    const records = JSON.parse(localStorage.getItem(SALES_STORAGE_KEY));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

function saveSales(records) {
  localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(records));
}

function loadSalesCustomers() {
  try {
    const records = JSON.parse(localStorage.getItem(SALES_CUSTOMER_STORAGE_KEY));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

function loadSalesInventoryRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(SALES_INVENTORY_STORAGE_KEY));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    return [];
  }
}

function saveSalesInventoryRecords(records) {
  localStorage.setItem(
    SALES_INVENTORY_STORAGE_KEY,
    JSON.stringify(records)
  );
}


// ==========================================
// 2. COMMON HELPER FUNCTIONS
// ==========================================

function escapeSalesHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function getSalesLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatSalesDate(dateValue) {
  if (!dateValue) return "—";

  const date = new Date(dateValue + "T00:00:00");

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatSalesMoney(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function salesToPaise(value) {
  return Math.round(Number(value) * 100);
}

function salesFromPaise(value) {
  return Number((value / 100).toFixed(2));
}


// ==========================================
// 3. FINANCIAL YEAR INVOICE NUMBER
// ==========================================

function generateSalesInvoiceNumber(dateValue, existingSales) {
  const saleDate = new Date(dateValue + "T00:00:00");

  if (Number.isNaN(saleDate.getTime())) {
    throw new Error("Invalid sale date.");
  }

  const calendarYear = saleDate.getFullYear();
  const month = saleDate.getMonth();

  const financialYearStart = month >= 3
    ? calendarYear
    : calendarYear - 1;

  const financialYearEnd = financialYearStart + 1;

  const prefix =
    "vs" +
    String(financialYearStart).slice(-2) +
    String(financialYearEnd).slice(-2);

  let highestUsedNumber = 0;

  existingSales.forEach(sale => {
    const invoice = String(sale.invoiceNumber || "");

    const match = invoice.match(
      new RegExp("^" + prefix + "(\\d+)$", "i")
    );

    if (match) {
      highestUsedNumber = Math.max(
        highestUsedNumber,
        Number(match[1])
      );
    }
  });

  const sequenceKey = "bizpilot_invoice_next_" + prefix;

  const storedNext = Number(localStorage.getItem(sequenceKey));

  const validStoredNext =
    Number.isInteger(storedNext) && storedNext > 0
      ? storedNext
      : 1;

  const nextNumber = Math.max(
    validStoredNext,
    highestUsedNumber + 1
  );

  localStorage.setItem(sequenceKey, String(nextNumber + 1));

  return prefix + String(nextNumber).padStart(4, "0");
}


// ==========================================
// 4. MULTI-ITEM INVOICE HELPERS
// ==========================================

// Get items from both new and old sale records.
// Old invoices contained only one item.
function salesGetItems(sale) {
  if (Array.isArray(sale.items) && sale.items.length > 0) {
    return sale.items;
  }

  if (sale.itemName) {
    return [{
      itemName: sale.itemName,
      quantity: Number(sale.quantity || 0),
      weightGrams: Number(sale.weightGrams || 0)
    }];
  }

  return [];
}

function salesGetItemSummary(sale) {
  return salesGetItems(sale).map(item => {
    return (
      `${item.itemName} (${item.quantity} pcs, ` +
      `${item.weightGrams} g)`
    );
  }).join("; ");
}

function salesGetTotalQuantity(sale) {
  return salesGetItems(sale).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
}

function salesGetTotalWeight(sale) {
  return salesGetItems(sale).reduce(
    (sum, item) => sum + Number(item.weightGrams || 0),
    0
  );
}


// ==========================================
// 5. ITEM ROW GENERATION
// ==========================================

function salesBuildItemRow(inventory, index) {
  const options = inventory.map(item => `
    <option value="${escapeSalesHTML(item.name)}">
      ${escapeSalesHTML(item.name)}
      (${Number(item.quantity)} pcs /
      ${Number(item.weightGrams)} g available)
    </option>
  `).join("");

  return `
    <div class="sales-item-row" data-sale-item-row>

      <div class="sales-field">
        <label>Item ${index + 1}</label>

        <select
          class="search-input"
          data-sale-item
          required
        >
          <option value="">Select an item</option>
          ${options}
        </select>
      </div>

      <div class="sales-field">
        <label>Quantity (pieces)</label>

        <input
          type="number"
          class="search-input"
          data-sale-quantity
          min="1"
          step="1"
          placeholder="Example: 2"
          required
        />
      </div>

      <div class="sales-field">
        <label>Weight (grams)</label>

        <input
          type="number"
          class="search-input"
          data-sale-weight
          min="0.001"
          step="0.001"
          placeholder="Example: 24"
          required
        />
      </div>

      <div class="sales-item-row-footer">

        <small
          class="sales-help"
          data-sale-stock-info
        >
          Select an item to view available stock.
        </small>

        <button
          type="button"
          class="muted-link"
          data-remove-sale-item
          ${index === 0 ? "disabled" : ""}
        >
          Remove item
        </button>

      </div>

    </div>
  `;
}


// ==========================================
// 6. STORAGE SNAPSHOT AND ROLLBACK
// ==========================================

function salesTakeStorageSnapshot(keys) {
  const snapshot = {};

  keys.forEach(key => {
    snapshot[key] = localStorage.getItem(key);
  });

  return snapshot;
}

function salesRestoreStorageSnapshot(snapshot) {
  Object.keys(snapshot).forEach(key => {
    if (snapshot[key] === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, snapshot[key]);
    }
  });
}


// ==========================================
// 7. AVAILABLE ADVANCE JAMA
// ==========================================

function salesGetAvailableJama(mobile) {
  try {
    const records = JSON.parse(
      localStorage.getItem(SALES_JAMA_STORAGE_KEY)
    ) || [];

    return records
      .filter(record =>
        String(record.customerMobile) === String(mobile) &&
        record.type === "jama"
      )
      .reduce((sum, record) => {
        return sum + Math.max(
          0,
          Number(record.remainingAmount) || 0
        );
      }, 0);

  } catch (error) {
    return 0;
  }
}


// ==========================================
// 8. SALES PAYMENT ALLOCATION HELPERS
// ==========================================

function salesGetPaymentAllocations(form) {
  return {
    cash: Number(form.elements.payCash.value || 0),
    upi: Number(form.elements.payUPI.value || 0),
    committee: Number(form.elements.payCommittee.value || 0),
    advanceJama: Number(form.elements.payJama.value || 0),
    udhar: Number(form.elements.payUdhar.value || 0)
  };
}

function salesGetAllocatedPaise(allocations) {
  return Object.values(allocations).reduce(
    (sum, amount) => sum + salesToPaise(amount),
    0
  );
}

function updateSalesPaymentTotal() {
  const form = document.getElementById("salesForm");

  if (!form) return;

  const finalAmountInput = document.getElementById("saleFinalAmount");
  const totalDisplay = document.getElementById("salesPaymentTotal");
  const status = document.getElementById("salesPaymentStatus");

  if (!finalAmountInput || !totalDisplay || !status) return;

  const allocations = salesGetPaymentAllocations(form);

  const allocatedPaise = salesGetAllocatedPaise(allocations);

  const finalAmount = Number(finalAmountInput.value);

  const finalPaise = Number.isFinite(finalAmount)
    ? salesToPaise(finalAmount)
    : 0;

  totalDisplay.textContent = formatSalesMoney(
    salesFromPaise(allocatedPaise)
  );

  if (!finalAmountInput.value || finalPaise <= 0) {
    status.textContent = "Enter the final amount and payment breakdown.";
    status.className = "sales-help";
    return;
  }

  if (allocatedPaise === finalPaise) {
    status.textContent = "Payment allocation matches the invoice amount.";
    status.className = "sales-help sales-success";
    return;
  }

  const difference = formatSalesMoney(
    salesFromPaise(Math.abs(finalPaise - allocatedPaise))
  );

  if (allocatedPaise < finalPaise) {
    status.textContent = "Amount still to allocate: " + difference;
  } else {
    status.textContent = "Over-allocated by: " + difference;
  }

  status.className = "sales-help sales-error";
}


// ==========================================
// 9. RENDER SALES PAGE
// ==========================================

function renderSalesPage() {
  const sales = loadSales();
  const inventory = loadSalesInventoryRecords();

  const totalSales = sales.reduce(
    (sum, sale) => sum + Number(sale.finalAmount || 0),
    0
  );

  const totalProfit = sales.reduce(
    (sum, sale) => sum + Number(sale.profit || 0),
    0
  );

  const rows = sales.length
    ? sales.map(sale => {
        const items = salesGetItems(sale);

        const itemHTML = items.map(item => `
          ${escapeSalesHTML(item.itemName)}
          (${Number(item.quantity)} pcs,
          ${Number(item.weightGrams)} g)
        `).join("<br>");

        const payments = sale.paymentAllocations || {};

        const paymentHTML = [
          Number(payments.cash || 0) > 0
            ? "Cash: " + formatSalesMoney(payments.cash)
            : "",

          Number(payments.upi || 0) > 0
            ? "UPI: " + formatSalesMoney(payments.upi)
            : "",

          Number(payments.committee || 0) > 0
            ? "Committee: " + formatSalesMoney(payments.committee)
            : "",

          Number(payments.advanceJama || 0) > 0
            ? "Advance Jama: " + formatSalesMoney(payments.advanceJama)
            : "",

          Number(payments.udhar || 0) > 0
            ? "Udhar: " + formatSalesMoney(payments.udhar)
            : ""

        ].filter(Boolean).join("<br>");

        return `
          <tr data-sales-row>

            <td>
              <strong>${escapeSalesHTML(sale.invoiceNumber)}</strong>
            </td>

            <td>${escapeSalesHTML(sale.customerMobile)}</td>

            <td>${escapeSalesHTML(sale.customerName)}</td>

            <td>${formatSalesDate(sale.date)}</td>

            <td>${itemHTML || "—"}</td>

            <td>${salesGetTotalQuantity(sale)} pcs</td>

            <td>
              ${salesGetTotalWeight(sale).toLocaleString("en-IN")} g
            </td>

            <td>${formatSalesMoney(sale.finalAmount)}</td>

            <td>${formatSalesMoney(sale.profit)}</td>

            <td>${paymentHTML || "Older sale"}</td>

          </tr>
        `;
      }).join("")

    : `
      <tr>
        <td colspan="10" class="empty-note">
          No sales recorded yet. Add your first sale below.
        </td>
      </tr>
    `;

  return `
    <div class="stats-grid">

      <div class="stat-card">
        <div class="stat-top">Total sales</div>
        <div class="stat-value">${sales.length}</div>
        <div class="stat-foot">Recorded invoices</div>
      </div>

      <div class="stat-card">
        <div class="stat-top">Total sale amount</div>
        <div class="stat-value">
          ${formatSalesMoney(totalSales)}
        </div>
        <div class="stat-foot">Across all recorded sales</div>
      </div>

      <div class="stat-card">
        <div class="stat-top">Total manually entered profit</div>
        <div class="stat-value">
          ${formatSalesMoney(totalProfit)}
        </div>
        <div class="stat-foot">Sum of entered profits</div>
      </div>

    </div>


    <!-- SALES RECORDS -->

    <div class="panel">

      <div class="panel-head">

        <div>
          <h3>Sales records</h3>

          <div class="panel-sub">
            Each row represents one invoice.
            An invoice can contain multiple items.
          </div>
        </div>

        <button
          type="button"
          class="muted-link"
          id="salesExport"
        >
          Export CSV ↓
        </button>

      </div>


      <div class="module-toolbar">

        <input
          type="search"
          id="salesSearch"
          class="search-input"
          placeholder="Search invoice, customer or item..."
        />

        <span class="panel-sub">
          ${sales.length} invoices
        </span>

      </div>


      <div class="table-wrap">

        <table class="data-table">

          <thead>
            <tr>
              <th>Invoice number</th>
              <th>Customer mobile</th>
              <th>Customer name</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total quantity</th>
              <th>Total weight</th>
              <th>Final amount</th>
              <th>Profit</th>
              <th>Payment breakdown</th>
            </tr>
          </thead>

          <tbody id="salesTableBody">
            ${rows}
          </tbody>

        </table>

      </div>

    </div>


    <!-- NEW SALE FORM -->

    <div class="panel">

      <div class="panel-head">

        <div>
          <h3>Record a sale</h3>

          <div class="panel-sub">
            Add as many different inventory items as the customer purchases.
          </div>
        </div>

      </div>


      <form id="salesForm" class="sales-form">

        <!-- CUSTOMER MOBILE -->

        <div class="sales-field">

          <label for="saleCustomerMobile">
            Customer mobile number
          </label>

          <input
            type="tel"
            id="saleCustomerMobile"
            name="customerMobile"
            maxlength="10"
            pattern="[0-9]{10}"
            inputmode="numeric"
            placeholder="Enter registered mobile number"
            required
          />

          <small
            id="saleCustomerLookupStatus"
            class="sales-help"
          >
            Enter the mobile number registered in Customers.
          </small>

        </div>


        <!-- CUSTOMER NAME -->

        <div class="sales-field">

          <label for="saleCustomerName">
            Customer name
          </label>

          <input
            type="text"
            id="saleCustomerName"
            class="search-input"
            placeholder="Customer name will appear here"
            readonly
          />

        </div>


        <!-- DATE -->

        <div class="sales-field">

          <label for="saleDate">
            Sale date
          </label>

          <input
            type="date"
            id="saleDate"
            name="date"
            class="search-input"
            value="${getSalesLocalDate()}"
            required
          />

        </div>


        <!-- MULTIPLE ITEMS -->

        <div class="sales-items-section">

          <div class="sales-items-heading">

            <div>
              <h4>Items in this invoice</h4>

              <small class="sales-help">
                Enter quantity and weight separately for every item.
              </small>
            </div>

            <button
              type="button"
              class="muted-link"
              id="addSaleItem"
            >
              + Add another item
            </button>

          </div>


          <div id="salesItemsContainer">

            ${salesBuildItemRow(inventory, 0)}

          </div>

        </div>


        <!-- FINAL AMOUNT -->

        <div class="sales-field">

          <label for="saleFinalAmount">
            Total final amount (₹)
          </label>

          <input
            type="number"
            id="saleFinalAmount"
            name="finalAmount"
            class="search-input"
            min="0.01"
            step="0.01"
            placeholder="Total amount for all items"
            required
          />

        </div>


        <!-- PROFIT -->

        <div class="sales-field">

          <label for="saleProfit">
            Total profit (₹)
          </label>

          <input
            type="number"
            id="saleProfit"
            name="profit"
            class="search-input"
            step="0.01"
            placeholder="Enter total profit manually"
            required
          />

        </div>


        <!-- PAYMENT BREAKDOWN -->

        <div class="sales-payment-section">

          <h4>Payment breakdown</h4>

          <p class="sales-help">
            Split the final invoice amount between the payment methods below.
            Their total must exactly match the final amount.
          </p>


          <div class="sales-payment-grid">


            <!-- CASH -->

            <div class="sales-field">

              <label for="salePayCash">
                Cash (₹)
              </label>

              <input
                type="number"
                id="salePayCash"
                name="payCash"
                class="search-input"
                min="0"
                step="0.01"
                value="0"
              />

            </div>


            <!-- UPI -->

            <div class="sales-field">

              <label for="salePayUPI">
                UPI / Bank (₹)
              </label>

              <input
                type="number"
                id="salePayUPI"
                name="payUPI"
                class="search-input"
                min="0"
                step="0.01"
                value="0"
              />

            </div>


            <!-- COMMITTEE -->

            <div class="sales-field">

              <label for="salePayCommittee">
                Committee payout (₹)
              </label>

              <input
                type="number"
                id="salePayCommittee"
                name="payCommittee"
                class="search-input"
                min="0"
                step="0.01"
                value="0"
              />

            </div>


            <!-- ADVANCE JAMA -->

            <div class="sales-field">

              <label for="salePayJama">
                Advance Jama (₹)
              </label>

              <input
                type="number"
                id="salePayJama"
                name="payJama"
                class="search-input"
                min="0"
                step="0.01"
                value="0"
              />

              <small class="sales-help">
                Uses the customer's existing Jama balance.
              </small>

            </div>


            <!-- UDHAR -->

            <div class="sales-field">

              <label for="salePayUdhar">
                Udhar (₹)
              </label>

              <input
                type="number"
                id="salePayUdhar"
                name="payUdhar"
                class="search-input"
                min="0"
                step="0.01"
                value="0"
              />

              <small class="sales-help">
                Automatically adds an Udhar entry for this customer.
              </small>

            </div>


          </div>


          <!-- PAYMENT TOTAL -->

          <div class="sales-payment-total">

            <span>Allocated payment total</span>

            <strong id="salesPaymentTotal">
              ₹0.00
            </strong>

            <small
              id="salesPaymentStatus"
              class="sales-help"
            >
              Enter the final amount and payment breakdown.
            </small>

          </div>

        </div>


        <!-- SAVE BUTTON -->

        <div class="sales-form-actions">

          <button
            type="submit"
            class="small-button"
            ${inventory.length ? "" : "disabled"}
          >
            + Save sale
          </button>

        </div>

      </form>


      <p class="panel-sub sales-note">
        Cash and UPI are added to Cash/Bank.
        Advance Jama is deducted from existing Jama.
        Udhar is added to the customer's Udhar records.
        Committee payout is recorded in this invoice only.
        Update Payout Used manually in Committee Management.
      </p>

    </div>
  `;
}


// ==========================================
// 10. CUSTOMER NAME AUTO-LOOKUP
// ==========================================

document.addEventListener("input", function(event) {

  if (event.target.id !== "saleCustomerMobile") return;

  const mobile = event.target.value.trim();

  const nameInput = document.getElementById("saleCustomerName");

  const message = document.getElementById(
    "saleCustomerLookupStatus"
  );

  if (!nameInput || !message) return;

  nameInput.value = "";

  if (!/^[0-9]{10}$/.test(mobile)) {

    message.textContent =
      "Enter the registered 10-digit mobile number.";

    message.className = "sales-help";

    return;
  }

  const customer = loadSalesCustomers().find(
    entry => String(entry.mobile) === mobile
  );

  if (!customer) {

    message.textContent =
      "Customer not found. Add this customer first.";

    message.className = "sales-help sales-error";

    return;
  }

  nameInput.value = customer.name;

  message.textContent = "Customer found.";

  message.className = "sales-help sales-success";

});


// ==========================================
// 11. ADD AND REMOVE ITEM ROWS
// ==========================================

document.addEventListener("click", function(event) {

  // ADD ITEM ROW

  if (event.target.closest("#addSaleItem")) {

    const container = document.getElementById(
      "salesItemsContainer"
    );

    if (!container) return;

    const inventory = loadSalesInventoryRecords();

    const index = container.querySelectorAll(
      "[data-sale-item-row]"
    ).length;

    container.insertAdjacentHTML(
      "beforeend",
      salesBuildItemRow(inventory, index)
    );

    salesUpdateRemoveButtons();

    return;
  }


  // REMOVE ITEM ROW

  const removeButton = event.target.closest(
    "[data-remove-sale-item]"
  );

  if (removeButton) {

    const row = removeButton.closest(
      "[data-sale-item-row]"
    );

    if (!row) return;

    const container = document.getElementById(
      "salesItemsContainer"
    );

    const rows = container.querySelectorAll(
      "[data-sale-item-row]"
    );

    if (rows.length <= 1) {

      toast("An invoice must contain at least one item.");

      return;
    }

    row.remove();

    salesUpdateRemoveButtons();
  }

});


function salesUpdateRemoveButtons() {

  const container = document.getElementById(
    "salesItemsContainer"
  );

  if (!container) return;

  const rows = container.querySelectorAll(
    "[data-sale-item-row]"
  );

  rows.forEach((row, index) => {

    const label = row.querySelector("label");

    if (label) {
      label.textContent = "Item " + (index + 1);
    }

    const button = row.querySelector(
      "[data-remove-sale-item]"
    );

    if (button) {
      button.disabled = rows.length <= 1;
    }

  });

}


// ==========================================
// 12. DISPLAY STOCK FOR SELECTED ITEM
// ==========================================

document.addEventListener("change", function(event) {

  if (!event.target.matches("[data-sale-item]")) return;

  const row = event.target.closest(
    "[data-sale-item-row]"
  );

  if (!row) return;

  const selectedName = event.target.value;

  const inventory = loadSalesInventoryRecords();

  const item = inventory.find(
    entry => entry.name === selectedName
  );

  const quantityInput = row.querySelector(
    "[data-sale-quantity]"
  );

  const weightInput = row.querySelector(
    "[data-sale-weight]"
  );

  const stockInfo = row.querySelector(
    "[data-sale-stock-info]"
  );

  if (!quantityInput || !weightInput || !stockInfo) return;

  quantityInput.value = "";
  weightInput.value = "";

  if (!item) {

    quantityInput.removeAttribute("max");
    weightInput.removeAttribute("max");

    stockInfo.textContent =
      "Select an item to view available stock.";

    return;
  }

  quantityInput.max = item.quantity;
  weightInput.max = item.weightGrams;

  stockInfo.textContent =
    "Available stock: " +
    item.quantity + " pieces / " +
    item.weightGrams + " grams.";

});


// ==========================================
// 13. LIVE PAYMENT TOTAL
// ==========================================

document.addEventListener("input", function(event) {

  if (
    event.target.closest("#salesForm") &&
    (
      event.target.id === "saleFinalAmount" ||
      [
        "payCash",
        "payUPI",
        "payCommittee",
        "payJama",
        "payUdhar"
      ].includes(event.target.name)
    )
  ) {

    updateSalesPaymentTotal();

  }

});


// ==========================================
// 14. SAVE SALE
// ==========================================

document.addEventListener("submit", function(event) {

  if (event.target.id !== "salesForm") return;

  event.preventDefault();

  const form = event.target;

  const mobile = form.elements.customerMobile.value.trim();

  const date = form.elements.date.value;

  const finalAmount = Number(
    form.elements.finalAmount.value
  );

  const profit = Number(
    form.elements.profit.value
  );


  // ----------------------------------------
  // CUSTOMER VALIDATION
  // ----------------------------------------

  if (!/^[0-9]{10}$/.test(mobile)) {

    toast("Enter a valid 10-digit customer mobile number.");

    return;
  }

  const customer = loadSalesCustomers().find(
    entry => String(entry.mobile) === mobile
  );

  if (!customer) {

    toast("Customer not found. Add the customer first.");

    return;
  }


  // ----------------------------------------
  // DATE VALIDATION
  // ----------------------------------------

  if (
    !date ||
    Number.isNaN(new Date(date + "T00:00:00").getTime())
  ) {

    toast("Please enter a valid sale date.");

    return;
  }


  // ----------------------------------------
  // FINAL AMOUNT AND PROFIT VALIDATION
  // ----------------------------------------

  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {

    toast("Final amount must be greater than zero.");

    return;
  }

  if (!Number.isFinite(profit)) {

    toast("Please enter a valid profit amount.");

    return;
  }


  // ----------------------------------------
  // READ ALL ITEM ROWS
  // ----------------------------------------

  const itemRows = Array.from(
    form.querySelectorAll("[data-sale-item-row]")
  );

  if (itemRows.length === 0) {

    toast("Add at least one item to the invoice.");

    return;
  }

  const invoiceItems = [];

  for (let index = 0; index < itemRows.length; index++) {

    const row = itemRows[index];

    const itemName = row.querySelector(
      "[data-sale-item]"
    ).value;

    const quantityRaw = row.querySelector(
      "[data-sale-quantity]"
    ).value;

    const weightRaw = row.querySelector(
      "[data-sale-weight]"
    ).value;

    const quantity = Number(quantityRaw);

    const weight = Number(weightRaw);


    if (!itemName) {

      toast(
        "Please select an item in item row " +
        (index + 1) + "."
      );

      return;
    }


    if (!Number.isInteger(quantity) || quantity <= 0) {

      toast(
        "Quantity in item row " +
        (index + 1) +
        " must be a positive whole number."
      );

      return;
    }


    const decimalPlaces = (
      String(weightRaw).split(".")[1] || ""
    ).length;

    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      decimalPlaces > 3
    ) {

      toast(
        "Enter a valid weight with up to 3 decimal places in item row " +
        (index + 1) + "."
      );

      return;
    }


    invoiceItems.push({
      itemName,
      quantity,
      weightGrams: weight
    });

  }


  // ----------------------------------------
  // PAYMENT ALLOCATIONS
  // ----------------------------------------

  const paymentAllocations = salesGetPaymentAllocations(form);

  const paymentFields = [
    ["cash", "payCash", "Cash"],
    ["upi", "payUPI", "UPI / Bank"],
    ["committee", "payCommittee", "Committee payout"],
    ["advanceJama", "payJama", "Advance Jama"],
    ["udhar", "payUdhar", "Udhar"]
  ];

  for (const [key, fieldName, label] of paymentFields) {

    const amount = paymentAllocations[key];

    const rawValue = form.elements[fieldName].value;

    const decimalPlaces = (
      String(rawValue).split(".")[1] || ""
    ).length;

    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      decimalPlaces > 2
    ) {

      toast(
        "Enter a valid " + label +
        " amount with a maximum of 2 decimal places."
      );

      return;
    }

  }


  // ----------------------------------------
  // PAYMENT TOTAL MUST MATCH INVOICE
  // ----------------------------------------

  const finalPaise = salesToPaise(finalAmount);

  const allocatedPaise = salesGetAllocatedPaise(
    paymentAllocations
  );

  if (allocatedPaise !== finalPaise) {

    toast(
      "Payment amounts must add up exactly to the final invoice amount. " +
      "Current allocated total: " +
      formatSalesMoney(salesFromPaise(allocatedPaise)) + "."
    );

    return;
  }


  // ----------------------------------------
  // ADVANCE JAMA VALIDATION
  // ----------------------------------------

  if (paymentAllocations.advanceJama > 0) {

    const availableJama = salesGetAvailableJama(mobile);

    if (
      salesToPaise(availableJama) <
      salesToPaise(paymentAllocations.advanceJama)
    ) {

      toast(
        "Insufficient Advance Jama. Available balance: " +
        formatSalesMoney(availableJama) + "."
      );

      return;
    }

    if (typeof applyJamaUdharSettlement !== "function") {

      toast(
        "Jama/Udhar module is not loaded. Refresh the page and try again."
      );

      return;
    }

  }


  // ----------------------------------------
  // UDHAR FUNCTION VALIDATION
  // ----------------------------------------

  if (
    paymentAllocations.udhar > 0 &&
    typeof addJamaUdharEntry !== "function"
  ) {

    toast(
      "Jama/Udhar module is not loaded. Refresh the page and try again."
    );

    return;
  }


  // ----------------------------------------
  // GROUP REPEATED ITEMS
  // ----------------------------------------
  // If the same item appears in two rows, combine
  // it for stock checking and deduction.

  const requestedByItem = new Map();

  invoiceItems.forEach(item => {

    const existing = requestedByItem.get(item.itemName) || {
      itemName: item.itemName,
      quantity: 0,
      weightGrams: 0
    };

    existing.quantity += item.quantity;

    existing.weightGrams = Number(
      (existing.weightGrams + item.weightGrams).toFixed(3)
    );

    requestedByItem.set(item.itemName, existing);

  });


  // ----------------------------------------
  // INVENTORY VALIDATION
  // ----------------------------------------

  const inventory = loadSalesInventoryRecords();

  for (const requested of requestedByItem.values()) {

    const stockItem = inventory.find(
      item => item.name === requested.itemName
    );

    if (!stockItem) {

      toast(
        "The item " + requested.itemName +
        " is not available in Inventory."
      );

      return;
    }


    if (requested.quantity > Number(stockItem.quantity)) {

      toast(
        "Insufficient quantity for " +
        requested.itemName +
        ". Available: " +
        stockItem.quantity + " pieces."
      );

      return;
    }


    if (requested.weightGrams > Number(stockItem.weightGrams)) {

      toast(
        "Insufficient weight for " +
        requested.itemName +
        ". Available: " +
        stockItem.weightGrams + " grams."
      );

      return;
    }


    const remainingQuantity =
      Number(stockItem.quantity) - requested.quantity;

    const remainingWeight = Number(
      (
        Number(stockItem.weightGrams) -
        requested.weightGrams
      ).toFixed(3)
    );


    if (
      (remainingQuantity === 0 && remainingWeight > 0) ||
      (remainingQuantity > 0 && remainingWeight === 0)
    ) {

      toast(
        "Please check quantity and weight for " +
        requested.itemName +
        ". Remaining stock must have both quantity and weight."
      );

      return;
    }

  }


  // ========================================
  // 15. PREPARE INVOICE AND STORAGE BACKUP
  // ========================================

  const sales = loadSales();

  const saleDate = new Date(date + "T00:00:00");

  const financialYearStart =
    saleDate.getMonth() >= 3
      ? saleDate.getFullYear()
      : saleDate.getFullYear() - 1;

  const financialYearPrefix =
    "vs" +
    String(financialYearStart).slice(-2) +
    String(financialYearStart + 1).slice(-2);

  const sequenceKey =
    "bizpilot_invoice_next_" + financialYearPrefix;


  const storageKeys = [
    SALES_STORAGE_KEY,
    SALES_INVENTORY_STORAGE_KEY,
    SALES_CASH_STORAGE_KEY,
    SALES_JAMA_STORAGE_KEY,
    SALES_JAMA_SETTLEMENTS_KEY,
    SALES_JAMA_NEXT_ID_KEY,
    sequenceKey
  ];

  const snapshot = salesTakeStorageSnapshot(storageKeys);


  // ========================================
  // 16. SAVE EVERYTHING
  // ========================================

  let invoiceNumber;

  try {

    // Generate invoice number.
    invoiceNumber = generateSalesInvoiceNumber(date, sales);


    // --------------------------------------
    // DEDUCT INVENTORY
    // --------------------------------------

    requestedByItem.forEach(requested => {

      const stockItem = inventory.find(
        item => item.name === requested.itemName
      );

      stockItem.quantity =
        Number(stockItem.quantity) - requested.quantity;

      stockItem.weightGrams = Number(
        (
          Number(stockItem.weightGrams) -
          requested.weightGrams
        ).toFixed(3)
      );

    });


    // --------------------------------------
    // CREATE SALE RECORD
    // --------------------------------------

    const totalQuantity = invoiceItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    const totalWeight = Number(
      invoiceItems.reduce(
        (sum, item) => sum + item.weightGrams,
        0
      ).toFixed(3)
    );

    const newSale = {

      invoiceNumber,

      customerMobile: customer.mobile,

      customerName: customer.name,

      date,

      // Complete item list for the invoice.
      items: invoiceItems,

      // Keep summary fields for compatibility
      // with the older sales data format.
      itemName: invoiceItems.map(
        item => item.itemName
      ).join(", "),

      quantity: totalQuantity,

      weightGrams: totalWeight,

      finalAmount,

      profit,

      paymentAllocations,

      paymentStatus: "paid",

      createdAt: new Date().toISOString()

    };


    // --------------------------------------
    // SAVE INVENTORY AND SALES
    // --------------------------------------

    saveSalesInventoryRecords(inventory);

    sales.push(newSale);

    saveSales(sales);


    // ======================================
    // 17. CASH AND UPI IN CASH/BANK
    // ======================================

    if (
      paymentAllocations.cash > 0 ||
      paymentAllocations.upi > 0
    ) {

      if (
        typeof loadCashTransactions !== "function" ||
        typeof saveCashTransactions !== "function"
      ) {

        throw new Error(
          "Cash/Bank module is not loaded."
        );

      }

      const cashRecords = loadCashTransactions();

      const createdAt = new Date().toISOString();


      // CASH ENTRY

      if (paymentAllocations.cash > 0) {

        cashRecords.push({

          id: "SALE-CASH-" + invoiceNumber,

          date,

          account: "cash",

          direction: "in",

          amount: paymentAllocations.cash,

          purpose: "sales",

          customerMobile: customer.mobile,

          customerName: customer.name,

          details: "Sale invoice " + invoiceNumber,

          reference: invoiceNumber,

          createdAt

        });

      }


      // UPI / BANK ENTRY

      if (paymentAllocations.upi > 0) {

        cashRecords.push({

          id: "SALE-UPI-" + invoiceNumber,

          date,

          account: "bank",

          direction: "in",

          amount: paymentAllocations.upi,

          purpose: "sales",

          customerMobile: customer.mobile,

          customerName: customer.name,

          details: "Sale invoice " + invoiceNumber + " (UPI / Bank)",

          reference: invoiceNumber,

          createdAt

        });

      }


      saveCashTransactions(cashRecords);

    }


    // ======================================
    // 18. ADVANCE JAMA SETTLEMENT
    // ======================================

    if (paymentAllocations.advanceJama > 0) {

      const result = applyJamaUdharSettlement({

        customerMobile: mobile,

        balanceType: "jama",

        amount: paymentAllocations.advanceJama,

        date,

        source: "sale",

        reference: invoiceNumber

      });


      if (
        !result ||
        salesToPaise(result.appliedAmount || 0) !==
          salesToPaise(paymentAllocations.advanceJama) ||
        salesToPaise(result.unappliedAmount || 0) !== 0
      ) {

        throw new Error(
          "The full Advance Jama amount could not be applied."
        );

      }

    }


    // ======================================
    // 19. AUTOMATIC UDHAR ENTRY
    // ======================================

    if (paymentAllocations.udhar > 0) {

      addJamaUdharEntry({

        customerMobile: mobile,

        type: "udhar",

        amount: paymentAllocations.udhar,

        date,

        notes:
          "Udhar from sale of " +
          invoiceItems.map(item =>
            item.itemName +
            " (" + item.quantity + " pcs)"
          ).join(", "),

        source: "sale",

        reference: invoiceNumber

      });


      // Verify that the new Udhar entry exists.
      const jamaRecords = JSON.parse(
        localStorage.getItem(SALES_JAMA_STORAGE_KEY)
      ) || [];


      const matchingUdhar = jamaRecords.some(record => {

        return (
          String(record.customerMobile) === mobile &&
          record.type === "udhar" &&
          String(record.reference || "") === invoiceNumber &&
          salesToPaise(record.originalAmount || 0) ===
            salesToPaise(paymentAllocations.udhar)
        );

      });


      if (!matchingUdhar) {

        throw new Error(
          "The Udhar entry could not be verified."
        );

      }

    }


  } catch (error) {

    // Restore all affected data if any step fails.
    salesRestoreStorageSnapshot(snapshot);

    console.error("Sale save failed:", error);

    toast(
      "Sale could not be completed. No stock or payment changes were kept. " +
      (error && error.message ? error.message : "")
    );

    return;

  }


  // ========================================
  // 20. SUCCESS
  // ========================================

  render("sales");

  toast(
    "Sale " + invoiceNumber +
    " recorded successfully."
  );

});


// ==========================================
// 21. SEARCH SALES
// ==========================================

document.addEventListener("input", function(event) {

  if (event.target.id !== "salesSearch") return;

  const searchText = event.target.value.toLowerCase();

  document.querySelectorAll("[data-sales-row]").forEach(row => {

    row.style.display =
      row.textContent.toLowerCase().includes(searchText)
        ? ""
        : "none";

  });

});


// ==========================================
// 22. EXPORT SALES TO CSV
// ==========================================

document.addEventListener("click", function(event) {

  if (event.target.id !== "salesExport") return;

  const sales = loadSales();

  const headers = [

    "Invoice number",
    "Customer mobile",
    "Customer name",
    "Date",
    "Items",
    "Total quantity",
    "Total weight (grams)",
    "Final amount",
    "Profit",
    "Cash",
    "UPI / Bank",
    "Committee",
    "Advance Jama",
    "Udhar"

  ];


  const rows = sales.map(sale => {

    const payments = sale.paymentAllocations || {};

    return [

      sale.invoiceNumber,

      sale.customerMobile,

      sale.customerName,

      sale.date,

      salesGetItemSummary(sale),

      salesGetTotalQuantity(sale),

      salesGetTotalWeight(sale),

      sale.finalAmount,

      sale.profit,

      payments.cash || 0,

      payments.upi || 0,

      payments.committee || 0,

      payments.advanceJama || 0,

      payments.udhar || 0

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

  link.download = "sales.csv";

  link.click();

  URL.revokeObjectURL(url);

  toast("Sales CSV exported.");

});