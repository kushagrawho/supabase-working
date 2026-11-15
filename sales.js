// SALES MANAGEMENT


let salesInventoryCache = [];
let salesCustomerCache = [];


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
  const month = String(now.getMonth() + 1).padStart(2, " 0");
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

async function renderSalesPage() {
  const [
  { data: salesData, error: salesError },
  { data: itemData, error: itemError },
  { data: inventoryData, error: inventoryError },
  { data: customersData, error: customersError }
] = await Promise.all([
  VasundharaDB.select("sales"),
  VasundharaDB.select("sale_items"),
  VasundharaDB.select("inventory"),
  VasundharaDB.select("customers")
]);

  if (salesError) throw salesError;
  if (itemError) throw itemError;
  if (inventoryError) throw inventoryError;
  if (customersError) throw customersError;

  const itemsBySale = {};

  (itemData || []).forEach(item => {
    if (!itemsBySale[item.sale_id]) {
      itemsBySale[item.sale_id] = [];
    }

    itemsBySale[item.sale_id].push({
      itemName: item.item_name,
      quantity: Number(item.quantity),
      weightGrams: Number(item.weight_grams)
    });
  });

  const sales = (salesData || []).map(sale => ({
    id: sale.id,
    invoiceNumber: sale.invoice_number,
    customerMobile: sale.customer_mobile,
    customerName: sale.customer_name,
    date: sale.date,
    finalAmount: Number(sale.final_amount),
    profit: Number(sale.profit),
    items: itemsBySale[sale.id] || [],
    paymentAllocations: {
      cash: Number(sale.cash),
      upi: Number(sale.upi),
      committee: Number(sale.committee),
      advanceJama: Number(sale.advance_jama),
      udhar: Number(sale.udhar)
    },
    paymentStatus: sale.payment_status
  }));

  const inventory = (inventoryData || []).map(item => ({
    id: item.id,
    name: item.name,
    quantity: Number(item.quantity),
    weightGrams: Number(item.weight_grams)
  }));

  salesInventoryCache = inventory;

salesCustomerCache = (customersData || []).map(customer => ({
  id: customer.id,
  mobile: customer.mobile,
  name: customer.name
}));

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

const customer = salesCustomerCache.find(
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

    const inventory = salesInventoryCache;

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

  const inventory = salesInventoryCache;

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



document.addEventListener("submit", async function(event) {

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

 const customer = salesCustomerCache.find(
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

  const inventory = salesInventoryCache;

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


  let invoiceNumber;

  try {
    const { data, error } = await VasundharaDB.supabase.rpc(
      "create_sales_invoice",
      {
        p_customer_mobile: mobile,
        p_date: date,
        p_final_amount: finalAmount,
        p_profit: profit,
        p_cash: paymentAllocations.cash,
        p_upi: paymentAllocations.upi,
        p_committee: paymentAllocations.committee,
        p_advance_jama: paymentAllocations.advanceJama,
        p_udhar: paymentAllocations.udhar,
        p_items: invoiceItems
      }
    );

    if (error) {
      throw error;
    }

    if (!data || !data.success || !data.invoiceNumber) {
      throw new Error("The invoice could not be confirmed by the database.");
    }

    invoiceNumber = data.invoiceNumber;

  } catch (error) {
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


document.addEventListener("click", async function(event) {

  if (event.target.id !== "salesExport") return;

  try {
    const [
      { data: sales, error: salesError },
      { data: saleItems, error: itemsError }
    ] = await Promise.all([
      VasundharaDB.select("sales"),
      VasundharaDB.select("sale_items")
    ]);

    if (salesError) throw salesError;
    if (itemsError) throw itemsError;

    const itemsBySale = {};

    (saleItems || []).forEach(item => {
      if (!itemsBySale[item.sale_id]) {
        itemsBySale[item.sale_id] = [];
      }

      itemsBySale[item.sale_id].push({
        itemName: item.item_name,
        quantity: Number(item.quantity),
        weightGrams: Number(item.weight_grams)
      });
    });

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

    const rows = (sales || []).map(sale => {
      const invoice = {
        items: itemsBySale[sale.id] || []
      };

      return [
        sale.invoice_number,
        sale.customer_mobile,
        sale.customer_name,
        sale.date,
        salesGetItemSummary(invoice),
        salesGetTotalQuantity(invoice),
        salesGetTotalWeight(invoice),
        sale.final_amount,
        sale.profit,
        sale.cash,
        sale.upi,
        sale.committee,
        sale.advance_jama,
        sale.udhar
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

  } catch (error) {
    console.error("Sales CSV export failed:", error);
    toast("Unable to export Sales CSV. Please try again.");
  }

});
