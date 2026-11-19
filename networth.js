
// ==========================================
// NET WORTH DASHBOARD
// Supabase-connected version
// ==========================================


// ==========================================
// FORMAT HELPERS
// ==========================================

function netWorthMoney(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


function netWorthWeight(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
    }) + " g";
}


function netWorthCurrentMonth() {
    const now = new Date();

    return now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0");
}


// ==========================================
// INVENTORY WEIGHT
// ==========================================

function netWorthGetInventoryWeight(inventory) {
    return inventory.reduce((total, item) => {
        return total + Math.max(
            0,
            Number(item.weight_grams) || 0
        );
    }, 0);
}


// ==========================================
// JAMA AND UDHAR
// ==========================================

function netWorthGetJamaUdhaar(records) {
    return records.reduce((totals, record) => {
        const remaining = Math.max(
            0,
            Number(record.remaining_amount) || 0
        );

        if (record.type === "jama") {
            totals.jama += remaining;
        }

        if (record.type === "udhar") {
            totals.udhar += remaining;
        }

        return totals;
    }, {
        jama: 0,
        udhar: 0
    });
}


// ==========================================
// COMMITTEE CALCULATIONS
// ==========================================

function netWorthGetCommitteeDetails(
    committees,
    members,
    payments
) {
    const currentMonth = netWorthCurrentMonth();

    let monthlyExpected = 0;
    let monthlyReceived = 0;
    let unusedPayouts = 0;

    // Only ongoing committees are included.
    const ongoingCommittees = committees.filter(
        committee => committee.status === "ongoing"
    );

    const ongoingCommitteeIds = new Set(
        ongoingCommittees.map(committee => committee.id)
    );

    ongoingCommittees.forEach(committee => {
        const startMonth = String(
            committee.start_date || ""
        ).slice(0, 7);

        const endMonth = String(
            committee.end_date || ""
        ).slice(0, 7);

        const isCurrentMonthActive =
            startMonth &&
            endMonth &&
            currentMonth >= startMonth &&
            currentMonth <= endMonth;

        if (isCurrentMonthActive) {
            const expectedForCommittee =
                Number(committee.member_count || 0) *
                Number(committee.monthly_amount || 0);

            monthlyExpected += expectedForCommittee;

            // Payments belonging to this committee
            // and the current month.
            payments.forEach(payment => {
                if (
                    payment.committee_id === committee.id &&
                    String(payment.month) === currentMonth
                ) {
                    monthlyReceived += Math.max(
                        0,
                        Number(payment.amount) || 0
                    );
                }
            });
        }
    });

    // Unused payouts are liabilities owed to winners.
    members.forEach(member => {
        if (ongoingCommitteeIds.has(member.committee_id)) {
            unusedPayouts += Math.max(
                0,
                Number(member.payout_remaining) || 0
            );
        }
    });

    // Do not allow received amount to exceed expected amount.
    monthlyReceived = Math.min(
        monthlyReceived,
        monthlyExpected
    );

    const monthlyReceivable = Math.max(
        0,
        monthlyExpected - monthlyReceived
    );

    return {
        monthlyExpected,
        monthlyReceived,
        monthlyReceivable,
        unusedPayouts
    };
}


// ==========================================
// CASH AND BANK
// ==========================================

function netWorthGetCashBank() {
    if (typeof getCashBalances !== "function") {
        throw new Error(
            "getCashBalances() was not found. Check cash.js loading order."
        );
    }

    const balances = getCashBalances() || {};

    return {
        cash: Number(
            balances.cash ??
            balances.cashBalance ??
            balances.cashInHand ??
            balances.cash_balance ??
            0
        ) || 0,

        bank: Number(
            balances.bank ??
            balances.bankBalance ??
            balances.bankTotal ??
            balances.bank_balance ??
            0
        ) || 0
    };
}


// ==========================================
// FETCH DATA AND CALCULATE NET WORTH
// ==========================================

async function calculateNetWorth() {

    const [
        inventoryResult,
        jamaResult,
        committeesResult,
        membersResult,
        paymentsResult
    ] = await Promise.all([
        VasundharaDB.select("inventory"),
        VasundharaDB.select("jama_udhar"),
        VasundharaDB.select("committees"),
        VasundharaDB.select("committee_members"),
        VasundharaDB.select("committee_payments")
    ]);

    // Stop if any database query fails.
    const results = [
        inventoryResult,
        jamaResult,
        committeesResult,
        membersResult,
        paymentsResult
    ];

    const failedResult = results.find(
        result => result.error
    );

    if (failedResult) {
        throw failedResult.error;
    }

    const inventory = inventoryResult.data || [];
    const jamaRecords = jamaResult.data || [];
    const committees = committeesResult.data || [];
    const members = membersResult.data || [];
    const payments = paymentsResult.data || [];

    // Calculate individual totals.
    const inventoryWeight =
        netWorthGetInventoryWeight(inventory);

    const jamaUdhaar =
        netWorthGetJamaUdhaar(jamaRecords);

    const committee =
        netWorthGetCommitteeDetails(
            committees,
            members,
            payments
        );

    const cashBank = netWorthGetCashBank();

    // Original net-worth formula.
    const netWorth =
        cashBank.cash +
        cashBank.bank +
        jamaUdhaar.udhar -
        jamaUdhaar.jama +
        committee.monthlyReceivable -
        committee.unusedPayouts;

    return {
        inventoryWeight,

        cash: cashBank.cash,
        bank: cashBank.bank,

        udhar: jamaUdhaar.udhar,
        jama: jamaUdhaar.jama,

        committeeExpected: committee.monthlyExpected,
        committeeReceived: committee.monthlyReceived,
        committeeReceivable: committee.monthlyReceivable,
        committeeLiability: committee.unusedPayouts,

        netWorth
    };
}


// ==========================================
// RENDER NET WORTH PAGE
// ==========================================

async function renderNetWorthPage() {

    const data = await calculateNetWorth();

    return `
        <div class="networth-page">

            <div class="panel">
                <div class="panel-head">
                    <div>
                        <h2>Net Worth Dashboard</h2>
                        <p class="panel-sub">
                            Your current business financial position.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="small-button"
                        onclick="location.reload()"
                    >
                        ↻ Refresh
                    </button>
                </div>

                <div class="networth-highlight">
                    <small>Estimated Financial Net Worth</small>
                    <h1>${netWorthMoney(data.netWorth)}</h1>
                    <p>
                        Cash + Bank + Udhaar − Jama
                        + Committee Receivable − Committee Liability
                    </p>
                </div>
            </div>


            <div class="panel">
                <h3>Inventory Weight</h3>

                <div class="networth-weight-card">
                    <span>Total remaining inventory weight</span>
                    <strong>${netWorthWeight(data.inventoryWeight)}</strong>
                </div>

                <p class="panel-sub">
                    Combined remaining weight of all inventory items.
                    Inventory weight is shown separately and is not
                    converted into money.
                </p>
            </div>


            <div class="panel">
                <h3>Financial Assets</h3>

                <div class="networth-breakdown">

                    <div class="networth-row">
                        <div>
                            <strong>Cash in Hand</strong>
                            <small>Available physical cash (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.cash)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Bank Balance</strong>
                            <small>Available bank balance (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.bank)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Outstanding Udhaar</strong>
                            <small>Money customers owe you (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.udhar)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Unpaid Committee Contributions</strong>
                            <small>Current month's contributions still to receive (+)</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeReceivable)}</strong>
                    </div>

                </div>
            </div>


            <div class="panel">
                <h3>Financial Liabilities</h3>

                <div class="networth-breakdown">

                    <div class="networth-row">
                        <div>
                            <strong>Outstanding Jama</strong>
                            <small>Advance payments and Jama balance (−)</small>
                        </div>
                        <strong>− ${netWorthMoney(data.jama)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Unused Committee Payouts</strong>
                            <small>Money still owed to committee winners (−)</small>
                        </div>
                        <strong>− ${netWorthMoney(data.committeeLiability)}</strong>
                    </div>

                </div>
            </div>


            <div class="panel">
                <h3>Committee Monthly Collection</h3>

                <div class="networth-breakdown">

                    <div class="networth-row">
                        <div>
                            <strong>Expected This Month</strong>
                            <small>Total monthly contribution of ongoing committees</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeExpected)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Already Received</strong>
                            <small>Payments recorded in Committee Management</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeReceived)}</strong>
                    </div>

                    <div class="networth-row">
                        <div>
                            <strong>Still To Receive</strong>
                            <small>Unpaid monthly contributions added to net worth</small>
                        </div>
                        <strong>${netWorthMoney(data.committeeReceivable)}</strong>
                    </div>

                </div>
            </div>


            <div class="panel">
                <div class="networth-total-row">
                    <strong>Financial Net Worth</strong>
                    <strong>${netWorthMoney(data.netWorth)}</strong>
                </div>

                <p class="panel-sub">
                    Inventory weight is not included in this rupee calculation.
                    Committee contributions already received are reflected
                    through Cash/Bank balances, not counted twice.
                </p>
            </div>

        </div>
    `;
}
