const pageInfo = {
  overview: ["Overview", "Here’s what’s happening with your business today."],
  customers: ["Manage customers", "Keep customer details and account activity in one place."],
  sales: ["Track sales", "Record sales and keep an eye on incoming revenue."],
  jama: ["Jama / Udhar", "Track money you need to collect and payments you need to make."],
  cash: ["Cash / Bank", "Monitor cash in hand and balances across bank accounts."],
  networth: ["Total net worth", "A simple snapshot of your business assets and liabilities."],
  committee: ["Committee", "Organise committee groups, members and contributions."],
  inventory: ["Inventory", "Keep track of stock, quantities and low-stock items."],
  reports: ["Profit vs expenses", "Review business performance for a selected period."]
};
const data = {
  customers: [{name:"Aarav Traders",phone:"98765 43210",balance:"₹12,500",status:"Active"},{name:"Mehta Stores",phone:"98111 22334",balance:"₹4,200",status:"Active"},{name:"Riya Enterprises",phone:"98990 11223",balance:"₹0",status:"Active"}],
  sales: [{name:"Retail sale",date:"09 Nov 2026",amount:"₹8,500",status:"Paid"},{name:"Order #1042",date:"08 Nov 2026",amount:"₹12,000",status:"Pending"},{name:"Wholesale order",date:"07 Nov 2026",amount:"₹6,750",status:"Paid"}],
  jama: [{name:"Aarav Traders",date:"05 Nov 2026",amount:"₹12,500",type:"Jama",status:"Pending"},{name:"Mehta Stores",date:"04 Nov 2026",amount:"₹4,200",type:"Udhar",status:"Pending"}],
  inventory: [{name:"Product A",date:"SKU-001",amount:"120 pcs",status:"In stock"},{name:"Product B",date:"SKU-002",amount:"8 pcs",status:"Low stock"},{name:"Product C",date:"SKU-003",amount:"64 pcs",status:"In stock"}]
};
let currentPage = "overview";
const $ = s => document.querySelector(s);
const pageContent = $("#pageContent");
function money(n){return "₹"+Number(n).toLocaleString("en-IN")}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2300)}
function stat(label,value,foot,icon){return `<div class="stat-card"><div class="stat-top">${label}<span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`}

let ovDashboardPeriod = "month";
let ovDashboardCustomFrom = "";
let ovDashboardCustomTo = "";

function ovDashboardGetRange() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let from;
    let to = today;

    if (ovDashboardPeriod === "today") {
        from = today;
    } else if (ovDashboardPeriod === "week") {
        from = new Date(today);
        from.setDate(today.getDate() - 6);
    } else if (ovDashboardPeriod === "quarter") {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        from = new Date(now.getFullYear(), quarterStartMonth, 1);
    } else if (ovDashboardPeriod === "year") {
        from = new Date(now.getFullYear(), 0, 1);
    } else if (ovDashboardPeriod === "custom") {
        from = ovDashboardCustomFrom
            ? new Date(ovDashboardCustomFrom + "T00:00:00")
            : new Date(now.getFullYear(), now.getMonth(), 1);

        to = ovDashboardCustomTo
            ? new Date(ovDashboardCustomTo + "T00:00:00")
            : today;
    } else {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const format = date =>
        date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");

    return {
        from: format(from),
        to: format(to)
    };
}

function ovDashboardInRange(date, from, to) {
    return Boolean(date && date >= from && date <= to);
}

function ovDashboardMoney(value) {
    return "₹" + (Number(value) || 0).toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}

function ovDashboardCard(label, value, note, icon) {
    return `
        <div class="stat-card">
            <div class="stat-top">
                ${label}
                <span class="stat-icon">${icon}</span>
            </div>
            <div class="stat-value">${value}</div>
            <div class="stat-foot">${note}</div>
        </div>
    `;
}

async function overview() {
    const [
        salesResult,
        jamaResult,
        cashResult,
        committees
    ] = await Promise.all([
        VasundharaDB.select("sales"),
        VasundharaDB.select("jama_udhar"),
        VasundharaDB.select("cash_bank_transactions"),
        loadCommitteesFromSupabase(),
        loadCashDataFromSupabase()
    ]);

    if (salesResult.error) throw salesResult.error;
    if (jamaResult.error) throw jamaResult.error;
    if (cashResult.error) throw cashResult.error;

    const sales = (salesResult.data || []).map(sale => ({
        ...sale,
        finalAmount: Number(sale.final_amount) || 0,
        profit: Number(sale.profit) || 0
    }));

    const jama = (jamaResult.data || []).map(record => ({
        ...record,
        remainingAmount: Number(record.remaining_amount) || 0
    }));

    const cashTransactions = (cashResult.data || []).map(record => ({
        ...record,
        amount: Number(record.amount) || 0
    }));

    const range = ovDashboardGetRange();

    const selectedSales = sales.filter(sale =>
        ovDashboardInRange(sale.date, range.from, range.to)
    );

    const selectedCash = cashTransactions.filter(record =>
        ovDashboardInRange(record.date, range.from, range.to)
    );

    const revenue = selectedSales.reduce(
        (sum, sale) => sum + sale.finalAmount, 0
    );

    const grossProfit = selectedSales.reduce(
        (sum, sale) => sum + sale.profit, 0
    );

    const expenses = selectedCash.filter(record =>
        record.direction === "out" &&
        ["business_expense", "house_expense", "loss"].includes(record.purpose) &&
        record.amount > 0
    );

    const totalExpenses = expenses.reduce(
        (sum, record) => sum + record.amount, 0
    );

    const houseAndLoss = expenses
        .filter(record =>
            ["house_expense", "loss"].includes(record.purpose)
        )
        .reduce((sum, record) => sum + record.amount, 0);

    // Matches the existing Reports page calculation.
    const netProfit = grossProfit - houseAndLoss;

    const profitMargin = revenue > 0
        ? (netProfit / revenue) * 100
        : 0;

    const cashBalances = getCashBalances();
    const cashBalance = Number(cashBalances.cash) || 0;
    const bankBalance = Number(cashBalances.bank) || 0;

    const udharRecords = jama.filter(record =>
        record.type === "udhar" && record.remainingAmount > 0
    );

    const jamaRecords = jama.filter(record =>
        record.type === "jama" && record.remainingAmount > 0
    );

    const udharTotal = udharRecords.reduce(
        (sum, record) => sum + record.remainingAmount, 0
    );

    const jamaTotal = jamaRecords.reduce(
        (sum, record) => sum + record.remainingAmount, 0
    );

    // Committee contribution calculations for the selected period.
    const firstMonth = range.from.slice(0, 7);
    const lastMonth = range.to.slice(0, 7);

    let expectedContributions = 0;
    let receivedContributions = 0;
    let unusedPayouts = 0;
    let activeCommittees = 0;

    committees.forEach(committee => {
        if (committee.status !== "ongoing") return;

        activeCommittees++;

        const startMonth = ovMonthKeyFromDate(committee.startDate);
        const endMonth = ovMonthKeyFromDate(committee.endDate);

        const first = startMonth > firstMonth ? startMonth : firstMonth;
        const last = endMonth < lastMonth ? endMonth : lastMonth;

        if (first && last && first <= last) {
            const startDate = new Date(first + "-01T00:00:00");
            const endDate = new Date(last + "-01T00:00:00");

            for (
                let d = new Date(startDate);
                d <= endDate;
                d.setMonth(d.getMonth() + 1)
            ) {
                const month = ovMonthKey(d);

                expectedContributions +=
                    (Number(committee.memberCount) || 0) *
                    (Number(committee.monthlyAmount) || 0);

                receivedContributions += (committee.payments || [])
                    .filter(payment => payment.month === month)
                    .reduce((sum, payment) =>
                        sum + (Number(payment.amount) || 0), 0);
            }
        }

        unusedPayouts += (committee.members || []).reduce(
            (sum, member) =>
                sum + Math.max(0, Number(member.payoutRemaining) || 0),
            0
        );
    });

    const unpaidContributions = Math.max(
        0,
        expectedContributions - receivedContributions
    );

    // Last six months of sales and invoice profit.
    const chartMonths = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = ovMonthKey(date);

        const monthSales = sales.filter(sale =>
            ovMonthKeyFromDate(sale.date) === key
        );

        chartMonths.push({
            label: date.toLocaleDateString("en-IN", { month: "short" }),
            revenue: monthSales.reduce(
                (sum, sale) => sum + sale.finalAmount, 0
            ),
            profit: monthSales.reduce(
                (sum, sale) => sum + sale.profit, 0
            )
        });
    }

    const maxChartValue = Math.max(
        1,
        ...chartMonths.flatMap(month => [
            month.revenue,
            Math.abs(month.profit)
        ])
    );

    const chartBars = chartMonths.map(month => {
        const revenueHeight = Math.max(
            2, month.revenue / maxChartValue * 100
        );

        const profitHeight = Math.max(
            2, Math.abs(month.profit) / maxChartValue * 100
        );

        return `
            <div class="ov-trend-column">
                <div class="ov-trend-bars">
                    <div class="ov-trend-bar revenue"
                         style="height:${revenueHeight}%"
                         title="Sales: ${ovDashboardMoney(month.revenue)}"></div>
                    <div class="ov-trend-bar profit"
                         style="height:${profitHeight}%"
                         title="Profit: ${ovDashboardMoney(month.profit)}"></div>
                </div>
                <span>${month.label}</span>
            </div>
        `;
    }).join("");

    const periodLabel = {
        today: "Today",
        week: "Last 7 days",
        month: "This month",
        quarter: "This quarter",
        year: "This year",
        custom: "Custom period"
    }[ovDashboardPeriod] || "This month";

    const customDates = ovDashboardPeriod === "custom" ? `
        <div class="ov-custom-dates">
            <label>
                From
                <input type="date" id="ovFromDate"
                    value="${range.from}">
            </label>
            <label>
                To
                <input type="date" id="ovToDate"
                    value="${range.to}">
            </label>
            <button class="small-button" id="ovApplyDates">
                Apply
            </button>
        </div>
    ` : "";

    return `
        <div class="ov-dashboard">

            <div class="ov-dashboard-header">
                <div>
                    <h2>Business performance</h2>
                    <p class="panel-sub">
                        Your financial position and business performance
                    </p>
                </div>

                <div class="ov-period-control">
                    <label for="ovPeriod">Reporting period</label>
                    <select id="ovPeriod" class="search-input">
                        <option value="today" ${ovDashboardPeriod === "today" ? "selected" : ""}>Today</option>
                        <option value="week" ${ovDashboardPeriod === "week" ? "selected" : ""}>Last 7 days</option>
                        <option value="month" ${ovDashboardPeriod === "month" ? "selected" : ""}>This month</option>
                        <option value="quarter" ${ovDashboardPeriod === "quarter" ? "selected" : ""}>This quarter</option>
                        <option value="year" ${ovDashboardPeriod === "year" ? "selected" : ""}>This year</option>
                        <option value="custom" ${ovDashboardPeriod === "custom" ? "selected" : ""}>Custom</option>
                    </select>
                </div>
            </div>

            ${customDates}

            <div class="ov-section-heading">
                <h3>Financial performance</h3>
                <span>${periodLabel}</span>
            </div>

            <div class="stats-grid ov-stats-grid">
                ${ovDashboardCard(
                    "Total sales",
                    ovDashboardMoney(revenue),
                    "Invoice revenue",
                    "↗"
                )}
                ${ovDashboardCard(
                    "Gross profit",
                    ovDashboardMoney(grossProfit),
                    "Profit recorded on invoices",
                    "◈"
                )}
                ${ovDashboardCard(
                    "Net profit",
                    ovDashboardMoney(netProfit),
                    "Invoice profit minus house expenses and losses",
                    "₹"
                )}
                ${ovDashboardCard(
                    "Profit margin",
                    profitMargin.toFixed(1) + "%",
                    "Net profit as a percentage of sales",
                    "%"
                )}
            </div>

            <section class="panel ov-panel">
                <div class="panel-head">
                    <div>
                        <h3>Sales and profit trend</h3>
                        <div class="panel-sub">
                            Monthly sales revenue and invoice profit — last 6 months
                        </div>
                    </div>
                    <button class="muted-link" data-page="reports">
                        View reports →
                    </button>
                </div>

                <div class="ov-trend-legend">
                    <span><i class="revenue-dot"></i> Sales</span>
                    <span><i class="profit-dot"></i> Invoice profit</span>
                </div>

                <div class="ov-trend-chart">
                    ${chartBars}
                </div>
            </section>

            <div class="ov-section-heading">
                <h3>Cash and bank position</h3>
                <span>Current balances</span>
            </div>

            <div class="ov-balance-grid">
                <div class="panel ov-balance-card">
                    <span>Cash in hand</span>
                    <strong>${ovDashboardMoney(cashBalance)}</strong>
                </div>
                <div class="panel ov-balance-card">
                    <span>Bank balance</span>
                    <strong>${ovDashboardMoney(bankBalance)}</strong>
                </div>
                <div class="panel ov-balance-card highlight">
                    <span>Total cash and bank</span>
                    <strong>${ovDashboardMoney(cashBalance + bankBalance)}</strong>
                </div>
            </div>

            <div class="ov-section-heading">
                <h3>Customer balances</h3>
                <span>Outstanding amounts</span>
            </div>

            <div class="ov-balance-grid">
                <div class="panel ov-balance-card">
                    <span>Outstanding Udhar</span>
                    <strong>${ovDashboardMoney(udharTotal)}</strong>
                    <small>${udharRecords.length} outstanding record(s)</small>
                </div>
                <div class="panel ov-balance-card">
                    <span>Outstanding Jama</span>
                    <strong>${ovDashboardMoney(jamaTotal)}</strong>
                    <small>${jamaRecords.length} outstanding record(s)</small>
                </div>
            </div>

            <div class="ov-section-heading">
                <h3>Committee performance</h3>
                <span>${activeCommittees} ongoing committee(s)</span>
            </div>

            <div class="ov-balance-grid">
                <div class="panel ov-balance-card">
                    <span>Expected contributions</span>
                    <strong>${ovDashboardMoney(expectedContributions)}</strong>
                </div>
                <div class="panel ov-balance-card">
                    <span>Received contributions</span>
                    <strong>${ovDashboardMoney(receivedContributions)}</strong>
                </div>
                <div class="panel ov-balance-card">
                    <span>Unpaid contributions</span>
                    <strong>${ovDashboardMoney(unpaidContributions)}</strong>
                </div>
                <div class="panel ov-balance-card">
                    <span>Unused payouts</span>
                    <strong>${ovDashboardMoney(unusedPayouts)}</strong>
                </div>
            </div>

            <div class="ov-dashboard-footer">
                Reporting period: ${range.from} to ${range.to}
            </div>
        </div>
    `;
}

function ovRead(key){try{const v=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(v)?v:[];}catch(e){return [];}}
function ovMonthKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function ovMonthKeyFromDate(v){if(!v||typeof v!=="string")return "";const m=v.match(/^(\d{4})-(\d{2})/);return m?m[1]+"-"+m[2]:"";}
function ovSum(rows,get){return rows.reduce((n,r)=>n+(Number(get(r))||0),0);}
function ovMoney(v){return "₹"+(Number(v)||0).toLocaleString("en-IN",{maximumFractionDigits:2});}
function ovCompare(a,b){if(b<=0)return {text:a>0?"New":"0%",className:a>0?"positive":""};const p=(a-b)/b*100;return {text:(p>=0?"↑ ":"↓ ")+Math.abs(p).toFixed(1)+"%",className:p>=0?"positive":"negative"};}
function ovStat(label,value,foot,icon){return '<div class="stat-card"><div class="stat-top">'+label+'<span class="stat-icon">'+icon+'</span></div><div class="stat-value">'+value+'</div><div class="stat-foot">'+foot+'</div></div>';}

function activity(icon,title,sub,amount,cls){return `<div class="activity-row"><div class="activity-icon">${icon}</div><div class="activity-text">${title}<small>${sub}</small></div><div class="activity-amount ${cls}">${amount}</div></div>`}
function featureCards(){return [
 ["customers","♙","Manage customers","Add customers, view details and account balances."],
 ["sales","↗","Track sales","Record sales, payments and pending orders."],
 ["jama","⇄","Jama / Udhar","Manage receivables, payables and due amounts."],
 ["cash","▣","Cash / Bank","Track cash in hand and bank transactions."],
 ["networth","◈","Total net worth","See assets, liabilities and net business value."],
 ["committee","◎","Committee","Manage members, instalments and payouts."],
 ["inventory","▤","Inventory","Monitor stock levels and item quantities."],
 ["reports","▥","Profit vs expenses","Compare income and expenses by date range."]
].map(([p,ic,t,d])=>`<button class="feature-card" data-page="${p}"><span class="stat-icon">${ic}</span><h3>${t}</h3><p>${d}</p></button>`).join("")}
function tablePage(key,headers,rows,formLabel,fields){
 const rowsHtml=rows.map(r=>`<tr>${r.map((v,i)=>`<td>${i===r.length-1?`<span class="pill ${String(v).toLowerCase().includes("pending")||String(v).toLowerCase().includes("low")?"pending":""}">${v}</span>`:v}</td>`).join("")}</tr>`).join("");
 return `<div class="panel"><div class="panel-head"><div><h3>${pageInfo[key][0]} list</h3><div class="panel-sub">Sample records to demonstrate the interface</div></div><button class="muted-link" id="exportBtn">Export CSV ↓</button></div>
 <div class="module-toolbar"><input class="search-input" id="tableSearch" placeholder="Search records..." /><span class="panel-sub">${rows.length} records shown</span></div>
 <div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody id="tableBody">${rowsHtml}</tbody></table></div></div>
 <div class="panel"><div class="panel-head"><div><h3>${formLabel}</h3><div class="panel-sub">Add a sample entry to the table</div></div></div><form id="addForm" class="form-row">${fields.map((f,i)=>`<input class="search-input" name="f${i}" placeholder="${f}" required />`).join("")}<button class="small-button" type="submit">＋ Add record</button></form></div>`;
}
function renderModule(key){
 if(key==="customers")return renderCustomersPage();
 if(key==="sales")return renderSalesPage();
 if(key==="jama")return renderJamaPage();
 if(key==="inventory")return renderInventoryPage();
 if (key === "cash") return renderCashPage();
 if (key === "committee") return renderCommitteePage();
 if (key === "networth") {
    return renderNetWorthPage();
}
if (key === "reports") return renderProfitExpensePage();
 const configs={
 cash:["Cash in hand","₹42,500","Bank balance","₹1,84,000","Recent transactions","Add cash / bank transaction"],
 networth:["Total assets","₹7,25,000","Total liabilities","₹1,52,900","Net worth","Assets minus liabilities"],
 committee:["Active committees","3","Total members","24","Committee overview","Create committee"],
 reports:["Total income","₹2,48,500","Total expenses","₹86,400","Profit for selected period","Select a date range"]
 };
 if(key==="cash"||key==="networth"||key==="committee"||key==="reports"){
  let c=configs[key];
  let extra=key==="reports"?`<div class="form-row" style="margin-top:17px"><label class="panel-sub">From <input class="date-input" type="date" value="2026-11-01"></label><label class="panel-sub">To <input class="date-input" type="date" value="2026-11-09"></label><button class="small-button" id="dateApply">Apply range</button></div>`:"";
  let net=key==="networth"?`<div class="info-box" style="margin-top:15px"><span>Estimated net worth</span><b>₹5,72,100</b></div>`:key==="reports"?`<div class="info-box" style="margin-top:15px"><span>Net profit</span><b class="positive">₹1,62,100</b></div>`:"";
  return `<div class="panel"><h3>${c[4]}</h3><div class="panel-sub">${pageInfo[key][1]}</div><div class="two-col" style="margin-top:18px"><div class="info-box"><span>${c[0]}</span><b>${c[1]}</b></div><div class="info-box"><span>${c[2]}</span><b>${c[3]}</b></div></div>${net}${extra}</div><div class="panel"><div class="panel-head"><h3>${c[5]}</h3></div><form id="simpleForm" class="form-row"><input class="search-input" placeholder="Description / name" required><input class="search-input" placeholder="Amount / details" required><button class="small-button">＋ Save entry</button></form><p class="panel-sub" style="margin-top:15px">This demo screen does not yet save financial or committee records.</p></div>`;
 }
 return `<div class="panel"><h3>${pageInfo[key][0]}</h3><p class="panel-sub">${pageInfo[key][1]}</p><div class="empty-note">Your ${pageInfo[key][0].toLowerCase()} workspace will appear here. Use the quick action to add your first record.</div><button class="small-button" id="placeholderAction">＋ Get started</button></div>`;
}

let renderRequestId = 0;


async function render(key) {
    const requestId = ++renderRequestId;

    currentPage = key;

    $("#crumb").textContent = pageInfo[key][0];
    $("#pageTitle").textContent =
        key === "overview" ? "Good evening, Admin 👋" : pageInfo[key][0];
    $("#pageSubtitle").textContent = pageInfo[key][1];

    document.querySelectorAll(".nav-item").forEach(button =>
        button.classList.toggle("active", button.dataset.page === key)
    );

    $("#featureMenu").classList.remove("open");
    $("#featureButton").setAttribute("aria-expanded", "false");

    pageContent.innerHTML = `
        <div class="empty-state">Loading...</div>
    `;

    try {
        const content = key === "overview"
            ? await overview()
            : await renderModule(key);

        // Ignore results from an older page request.
        if (requestId !== renderRequestId) return;

        pageContent.innerHTML = content ?? "";

        if (key === "cash") {
            filterCashTransactions();
        }

        // Overview date filter events.
        if (key === "overview") {
            const periodSelect = $("#ovPeriod");

            if (periodSelect) {
                periodSelect.addEventListener("change", () => {
                    ovDashboardPeriod = periodSelect.value;
                    render("overview");
                });
            }

            const applyDates = $("#ovApplyDates");

            if (applyDates) {
                applyDates.addEventListener("click", () => {
                    const from = $("#ovFromDate").value;
                    const to = $("#ovToDate").value;

                    if (!from || !to) {
                        toast("Please select both dates.");
                        return;
                    }

                    if (from > to) {
                        toast("Start date cannot be after end date.");
                        return;
                    }

                    ovDashboardCustomFrom = from;
                    ovDashboardCustomTo = to;
                    render("overview");
                });
            }
        }

    } catch (error) {
        if (requestId !== renderRequestId) return;

        console.error("Page loading error:", error);

        pageContent.innerHTML = `
            <div class="empty-state">
                Unable to load this page. Please try again.
                <br>
                <small>${error.message || "Please check your connection."}</small>
            </div>
        `;
    }
}


document.addEventListener("click",e=>{
 const page=e.target.closest("[data-page]");if(page){render(page.dataset.page);return}
});
$("#featureButton").addEventListener("click",()=>{let open=$("#featureMenu").classList.toggle("open");$("#featureButton").setAttribute("aria-expanded",String(open))});
document.addEventListener("click",e=>{if(!e.target.closest(".feature-wrap"))$("#featureMenu").classList.remove("open")});
$("#quickAction").addEventListener("click",()=>toast("Choose a feature from the menu to add a record."));
pageContent.addEventListener("submit",e=>{
 if(e.target.id==="addForm"){e.preventDefault();const values=[...new FormData(e.target).values()];const key=currentPage;
 const obj=key==="customers"?{name:values[0],phone:values[1],balance:values[2],status:values[3]}:key==="sales"?{name:values[0],date:values[1],amount:values[2],status:values[3]}:key==="jama"?{name:values[0],date:values[1],amount:values[2],type:values[3],status:values[4]}:{name:values[0],date:values[1],amount:values[2],status:values[3]};
 data[key].unshift(obj);render(key);toast("Sample record added.");}
 if(e.target.id==="simpleForm"){e.preventDefault();toast("Entry captured in this demo. Backend storage can be added next.");}
});
pageContent.addEventListener("input",e=>{if(e.target.id==="tableSearch"){const q=e.target.value.toLowerCase();$("#tableBody").querySelectorAll("tr").forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?"":"none")}});
pageContent.addEventListener("click",e=>{
 if(e.target.id==="exportBtn"){const rows=[...$("#tableBody").querySelectorAll("tr")].map(tr=>[...tr.children].map(td=>td.textContent.trim()));const head=[...e.target.closest(".panel").querySelectorAll("th")].map(th=>th.textContent);const csv=[head,...rows].map(r=>r.map(v=>`"${v.replaceAll('"','""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=currentPage+".csv";a.click();URL.revokeObjectURL(a.href);toast("CSV exported.");}
 if(e.target.id==="dateApply")toast("Date range applied to the sample report.");
 if(e.target.id==="placeholderAction")toast("This section is ready for your business records.");
});
$("#today").textContent = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
});

window.vasundharaAuthReady.then(function (isAuthenticated) {
    if (isAuthenticated) {
        render("overview");
    }
});
