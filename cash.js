// ==========================================
// CASH / UPI MANAGEMENT
// ==========================================

const CASH_STORAGE_KEY = "bizpilot_cash_bank_v1";
const CASH_OPENING_KEY = "bizpilot_cash_opening_balances_v1";
let cashTransactionsCache = [];

let cashOpeningCache = {
    cash: 0,
    bank: 0
};

function loadCashTransactions() {
    return cashTransactionsCache;
}

function saveCashTransactions(records) {
    cashTransactionsCache = records;
}

function loadCashOpeningBalances() {
    return cashOpeningCache;
}

function saveCashOpeningBalances(balances) {
    cashOpeningCache = balances;
}

async function loadCashDataFromSupabase() {
    const { data: openingData, error: openingError } =
        await VasundharaDB.select("cash_bank_opening_balances");

    if (openingError) {
        throw openingError;
    }

    const { data: transactionData, error: transactionError } =
        await VasundharaDB.select("cash_bank_transactions");

    if (transactionError) {
        throw transactionError;
    }

    cashOpeningCache = {
        cash: 0,
        bank: 0
    };

    (openingData || []).forEach(record => {
        if (record.account === "cash") {
            cashOpeningCache.cash = Number(record.opening_balance) || 0;
        }

        if (record.account === "bank") {
            cashOpeningCache.bank = Number(record.opening_balance) || 0;
        }
    });

    cashTransactionsCache = (transactionData || []).map(record => ({
        id: record.id,
        date: record.date,
        account: record.account,
        direction: record.direction,
        amount: Number(record.amount) || 0,
        purpose: record.purpose,
        customerMobile: record.customer_mobile || "",
        customerName: record.customer_name || "",
        details: record.details || "",
        transferId: record.transfer_id || "",
        createdAt: record.created_at
    }));
}

function cashEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function cashMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function cashToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getCashCustomerName(mobile) {
    if (!mobile) return "";

    try {
        const customers = JSON.parse(
            localStorage.getItem("bizpilot_customers_v1")
        ) || [];

        const customer = customers.find(
            item => String(item.mobile) === String(mobile)
        );

        return customer ? customer.name : "";
    } catch (error) {
        return "";
    }
}

function getCashBalances() {
    const opening = loadCashOpeningBalances();
    const records = loadCashTransactions();

    let cash = Number(opening.cash) || 0;
    let bank = Number(opening.bank) || 0;

    records.forEach(record => {
        const amount = Number(record.amount) || 0;
        const change = record.direction === "in" ? amount : -amount;

        if (record.account === "cash") cash += change;
        if (record.account === "bank") bank += change;
    });

    return { cash, bank };
}

async function saveCashOpeningForm() {
    const cash = Number(document.getElementById("cashOpeningCash").value);
    const bank = Number(document.getElementById("cashOpeningBank").value);

    if (!Number.isFinite(cash) || !Number.isFinite(bank) || cash < 0 || bank < 0) {
        alert("Please enter valid opening balances. Amounts cannot be negative.");
        return;
    }

    try {
        const { error } = await VasundharaDB.supabase
            .from("cash_bank_opening_balances")
            .upsert([
                { account: "cash", opening_balance: cash },
                { account: "bank", opening_balance: bank }
            ], { onConflict: "account" });

        if (error) throw error;

        await render("cash");

        alert("Opening balances saved successfully.");
    } catch (error) {
        console.error("Opening balance save error:", error);
        alert("Unable to save opening balances. Please try again.");
    }
}

function updateCashCustomerName() {
    const mobile = document.getElementById("cashCustomerMobile").value.trim();
    const name = getCashCustomerName(mobile);
    const nameField = document.getElementById("cashCustomerName");

    if (nameField) {
        nameField.value = name || "";
    }
}

function updateCashPurposeFields() {
    const purpose = document.getElementById("cashPurpose").value;
    const customerSection = document.getElementById("cashCustomerSection");
    const direction = document.getElementById("cashDirection");

    const needsCustomer = purpose === "advance_jama" || purpose === "udhar_clearance";

    customerSection.style.display = needsCustomer ? "block" : "none";

    if (purpose === "advance_jama" || purpose === "udhar_clearance" || purpose === "sales") {
        direction.value = "in";
    } else if (
        purpose === "business_expense" ||
        purpose === "house_expense" ||
        purpose === "loss"
    ) {
        direction.value = "out";
    }
}

function addCashTransaction() {
    const account = document.getElementById("cashAccount").value;
    const direction = document.getElementById("cashDirection").value;
    const amount = Number(document.getElementById("cashAmount").value);
    const date = document.getElementById("cashDate").value;
    const purpose = document.getElementById("cashPurpose").value;
    const mobile = document.getElementById("cashCustomerMobile").value.trim();
    const details = document.getElementById("cashDetails").value.trim();

    if (!date || !Number.isFinite(amount) || amount <= 0) {
        alert("Please enter a valid date and amount greater than zero.");
        return;
    }

    if (!purpose) {
        alert("Please select a transaction purpose.");
        return;
    }

    let customerName = "";

    if (purpose === "advance_jama" || purpose === "udhar_clearance") {
        customerName = getCashCustomerName(mobile);

        if (!mobile || !customerName) {
            alert("Please enter the mobile number of a registered customer.");
            return;
        }
    }

    if (purpose === "other" && !details) {
        alert("Please enter details for the Other transaction.");
        return;
    }

    const records = loadCashTransactions();

    // Advance received from a customer: create a Jama entry.
    if (purpose === "advance_jama") {
        if (typeof addJamaUdharEntry !== "function") {
            alert("Jama/Udhar module is not available. Please check the script loading order.");
            return;
        }

        addJamaUdharEntry({
            customerMobile: mobile,
            type: "jama",
            amount,
            date,
            notes: details || "Advance received through Cash/UPI",
            source: "cash_bank",
            reference: ""
        });
    }

    // Customer pays an existing Udhar. Any extra amount becomes Jama.
    if (purpose === "udhar_clearance") {
        if (typeof applyJamaUdharSettlement !== "function" ||
            typeof addJamaUdharEntry !== "function") {
            alert("Jama/Udhar module is not available. Please check the script loading order.");
            return;
        }

        const result = applyJamaUdharSettlement({
            customerMobile: mobile,
            balanceType: "udhar",
            amount,
            date,
            source: "cash_bank",
            reference: ""
        });

        if (!result || typeof result.appliedAmount !== "number") {
            alert("The Udhar settlement could not be completed. No Cash/UPI transaction was added.");
            return;
        }

        if (result.unappliedAmount > 0) {
            addJamaUdharEntry({
                customerMobile: mobile,
                type: "jama",
                amount: result.unappliedAmount,
                date,
                notes: "Extra amount received after Udhar clearance",
                source: "cash_bank",
                reference: ""
            });
        }
    }

    records.push({
        id: Date.now().toString(),
        date,
        account,
        direction,
        amount,
        purpose,
        customerMobile: mobile,
        customerName,
        details,
        createdAt: new Date().toISOString()
    });

    saveCashTransactions(records);
    renderCashPage();
    alert("Cash/UPI transaction added successfully.");
}

function addCashTransfer() {
    const transferType = document.getElementById("cashTransferType").value;
    const amount = Number(document.getElementById("cashTransferAmount").value);
    const date = document.getElementById("cashTransferDate").value;
    const details = document.getElementById("cashTransferDetails").value.trim();

    if (!date || !Number.isFinite(amount) || amount <= 0) {
        alert("Please enter a valid transfer date and amount greater than zero.");
        return;
    }

    const records = loadCashTransactions();
    const transferId = "TR-" + Date.now();

    // Cash to Bank: Cash goes out and Bank receives the amount.
    if (transferType === "cash_to_bank") {
        records.push({
            id: transferId + "-C",
            transferId,
            date,
            account: "cash",
            direction: "out",
            amount,
            purpose: "transfer",
            details: details || "Cash deposited into bank",
            customerMobile: "",
            customerName: ""
        });

        records.push({
            id: transferId + "-B",
            transferId,
            date,
            account: "bank",
            direction: "in",
            amount,
            purpose: "transfer",
            details: details || "Cash received in bank",
            customerMobile: "",
            customerName: ""
        });
    } else {
        // Bank to Cash: Bank goes out and Cash receives the amount.
        records.push({
            id: transferId + "-B",
            transferId,
            date,
            account: "bank",
            direction: "out",
            amount,
            purpose: "transfer",
            details: details || "Amount withdrawn from bank",
            customerMobile: "",
            customerName: ""
        });

        records.push({
            id: transferId + "-C",
            transferId,
            date,
            account: "cash",
            direction: "in",
            amount,
            purpose: "transfer",
            details: details || "Cash received from bank withdrawal",
            customerMobile: "",
            customerName: ""
        });
    }

    saveCashTransactions(records);
    renderCashPage();
    alert("Cash/Bank transfer recorded successfully.");
}

function getCashPurposeLabel(purpose) {
    const labels = {
        sales: "Sales made",
        business_expense: "Business expense",
        house_expense: "House expense",
        advance_jama: "Advance payment (Jama)",
        udhar_clearance: "Udhar clearance",
        loss: "Loss",
        other: "Other",
        transfer: "Cash/Bank transfer"
    };

    return labels[purpose] || purpose;
}

function filterCashTransactions() {
    const search = (document.getElementById("cashSearch")?.value || "")
        .toLowerCase()
        .trim();

    const records = loadCashTransactions().slice().reverse();

    const filtered = records.filter(record => {
        const text = [
            record.date,
            record.account,
            record.direction,
            record.amount,
            getCashPurposeLabel(record.purpose),
            record.customerMobile,
            record.customerName,
            record.details,
            record.transferId
        ].join(" ").toLowerCase();

        return text.includes(search);
    });

    const tbody = document.getElementById("cashTransactionsBody");
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">No transactions found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((record, index) => `
        <tr>
            <td>${records.length - index}</td>
            <td>${cashEscape(record.date)}</td>
            <td>${record.account === "cash" ? "Cash" : "UPI / Bank"}</td>
            <td>${record.direction === "in" ? "Money In" : "Money Out"}</td>
            <td>${cashEscape(getCashPurposeLabel(record.purpose))}</td>
            <td>${cashEscape(record.customerName || "-")}<br>
                <small>${cashEscape(record.customerMobile || "")}</small>
            </td>
            <td>${cashMoney(record.amount)}</td>
            <td>${cashEscape(record.details || "-")}</td>
        </tr>
    `).join("");
}

function exportCashCSV() {
    const records = loadCashTransactions();

    if (records.length === 0) {
        alert("There are no transactions to export.");
        return;
    }

    const headings = [
        "Date", "Account", "Direction", "Purpose",
        "Customer Name", "Customer Mobile", "Amount", "Details", "Transfer ID"
    ];

    const rows = records.map(record => [
        record.date,
        record.account === "cash" ? "Cash" : "UPI / Bank",
        record.direction === "in" ? "Money In" : "Money Out",
        getCashPurposeLabel(record.purpose),
        record.customerName || "",
        record.customerMobile || "",
        record.amount,
        record.details || "",
        record.transferId || ""
    ]);

    const csv = [headings, ...rows].map(row =>
        row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "cash-upi-transactions.csv";
    link.click();

    URL.revokeObjectURL(url);
}

async function renderCashPage() {
    try {
        await loadCashDataFromSupabase();
    } catch (error) {
        console.error("Cash data loading error:", error);
        alert("Unable to load Cash / Bank data. Please try again.");
        return;
    }
    const opening = loadCashOpeningBalances();
    const balances = getCashBalances();
    const records = loadCashTransactions();

    

    return `
        <div class="cash-page">
            <h2>Cash / UPI Management</h2>
            <p>Track money received, money spent, and transfers between Cash and Bank.</p>

            <div class="cash-summary">
                <div class="cash-summary-card">
                    <h3>Available Cash</h3>
                    <strong>${cashMoney(balances.cash)}</strong>
                </div>
                <div class="cash-summary-card">
                    <h3>Available UPI / Bank</h3>
                    <strong>${cashMoney(balances.bank)}</strong>
                </div>
                <div class="cash-summary-card">
                    <h3>Total Cash + Bank</h3>
                    <strong>${cashMoney(balances.cash + balances.bank)}</strong>
                </div>
            </div>

            <section class="cash-section">
                <h3>Opening Balances</h3>
                <p>Enter the amount you already have in Cash and Bank when starting this record system.</p>

                <div class="cash-form-grid">
                    <label>
                        Opening Cash (₹)
                        <input type="number" id="cashOpeningCash" min="0" step="0.01"
                            value="${Number(opening.cash) || 0}">
                    </label>
                    <label>
                        Opening UPI / Bank (₹)
                        <input type="number" id="cashOpeningBank" min="0" step="0.01"
                            value="${Number(opening.bank) || 0}">
                    </label>
                </div>

                <button onclick="saveCashOpeningForm()">Save Opening Balances</button>
            </section>

            <section class="cash-section">
                <h3>Add Cash / UPI Transaction</h3>

                <div class="cash-form-grid">
                    <label>
                        Date
                        <input type="date" id="cashDate" value="${cashToday()}">
                    </label>

                    <label>
                        Account
                        <select id="cashAccount">
                            <option value="cash">Cash</option>
                            <option value="bank">UPI / Bank</option>
                        </select>
                    </label>

                    <label>
                        Transaction Type
                        <select id="cashDirection">
                            <option value="in">Money In</option>
                            <option value="out">Money Out</option>
                        </select>
                    </label>

                    <label>
                        Amount (₹)
                        <input type="number" id="cashAmount" min="0.01" step="0.01"
                            placeholder="Enter amount">
                    </label>

                    <label>
                        Purpose
                        <select id="cashPurpose" onchange="updateCashPurposeFields()">
                            <option value="">Select purpose</option>
                            <option value="sales">Sales made</option>
                            <option value="business_expense">Business expense</option>
                            <option value="house_expense">House expense</option>
                            <option value="advance_jama">Advance payment (Jama)</option>
                            <option value="udhar_clearance">Udhar clearance</option>
                            <option value="loss">Loss</option>
                            <option value="other">Other</option>
                        </select>
                    </label>
                </div>

                <div id="cashCustomerSection" class="cash-form-grid" style="display:none;">
                    <label>
                        Customer Mobile
                        <input type="text" id="cashCustomerMobile"
                            placeholder="Enter registered customer mobile"
                            oninput="updateCashCustomerName()">
                    </label>
                    <label>
                        Customer Name
                        <input type="text" id="cashCustomerName" readonly
                            placeholder="Name will appear automatically">
                    </label>
                </div>

                <label class="cash-full-field">
                    Details / Notes
                    <textarea id="cashDetails" rows="2"
                        placeholder="Optional notes or reason"></textarea>
                </label>

                <button onclick="addCashTransaction()">Save Transaction</button>
            </section>

            <section class="cash-section">
                <h3>Cash ↔ Bank Transfer</h3>
                <p>Use this for ATM withdrawals or depositing cash into the bank. It changes both balances but does not count as income or expense.</p>

                <div class="cash-form-grid">
                    <label>
                        Transfer Type
                        <select id="cashTransferType">
                            <option value="cash_to_bank">Cash to Bank (Deposit)</option>
                            <option value="bank_to_cash">Bank to Cash (Withdrawal)</option>
                        </select>
                    </label>
                    <label>
                        Date
                        <input type="date" id="cashTransferDate" value="${cashToday()}">
                    </label>
                    <label>
                        Amount (₹)
                        <input type="number" id="cashTransferAmount" min="0.01"
                            step="0.01" placeholder="Enter amount">
                    </label>
                    <label>
                        Details
                        <input type="text" id="cashTransferDetails"
                            placeholder="Optional details">
                    </label>
                </div>

                <button onclick="addCashTransfer()">Save Transfer</button>
            </section>

            <section class="cash-section">
                <div class="cash-table-heading">
                    <h3>Transaction History</h3>
                    <button onclick="exportCashCSV()">Export CSV</button>
                </div>

                <input type="text" id="cashSearch" class="cash-search"
                    placeholder="Search transactions..."
                    oninput="filterCashTransactions()">

                <div class="cash-table-wrap">
                    <table class="cash-table">
                        <thead>
                            <tr>
                                <th>Sr.</th>
                                <th>Date</th>
                                <th>Account</th>
                                <th>Type</th>
                                <th>Purpose</th>
                                <th>Customer</th>
                                <th>Amount</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody id="cashTransactionsBody"></tbody>
                    </table>
                </div>
            </section>
        </div>
    `;
}