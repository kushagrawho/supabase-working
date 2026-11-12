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
function overview(){
 const now=new Date(), currentMonth=ovMonthKey(now);
 const previousDate=new Date(now.getFullYear(),now.getMonth()-1,1), previousMonth=ovMonthKey(previousDate);
 const sales=ovRead("bizpilot_sales_v1"), jama=ovRead("bizpilot_jama_udhar_v1");
 const cash=ovRead("bizpilot_cash_bank_v1"), committees=ovRead("bizpilot_committees_v1");
 const currentSales=sales.filter(s=>ovMonthKeyFromDate(s.date)===currentMonth);
 const previousSales=sales.filter(s=>ovMonthKeyFromDate(s.date)===previousMonth);
 const currentTotalSales=ovSum(currentSales,s=>s.finalAmount), previousTotalSales=ovSum(previousSales,s=>s.finalAmount);
 const expenses=cash.filter(t=>ovMonthKeyFromDate(t.date)===currentMonth&&t.direction==="out"&&(t.purpose==="house_expense"||t.purpose==="loss"));
 const oldExpenses=cash.filter(t=>ovMonthKeyFromDate(t.date)===previousMonth&&t.direction==="out"&&(t.purpose==="house_expense"||t.purpose==="loss"));
 const expenseTotal=ovSum(expenses,t=>t.amount), previousExpenseTotal=ovSum(oldExpenses,t=>t.amount);
 const previousProfit=ovSum(previousSales,s=>s.profit);
 const udharRecords=jama.filter(r=>r.type==="udhar"&&Number(r.remainingAmount)>0);
 const jamaTotal=ovSum(jama.filter(r=>r.type==="jama"),r=>r.remainingAmount);
 const udharTotal=ovSum(udharRecords,r=>r.remainingAmount);
 let expected=0,received=0,unused=0;
 committees.forEach(c=>{
  if(c.status!=="ongoing")return;
  if(currentMonth>=ovMonthKeyFromDate(c.startDate)&&currentMonth<=ovMonthKeyFromDate(c.endDate)){
   expected+=(Number(c.memberCount)||0)*(Number(c.monthlyAmount)||0);
   received+=(c.payments||[]).filter(p=>p.month===currentMonth).reduce((n,p)=>n+(Number(p.amount)||0),0);
  }
  unused+=(c.members||[]).reduce((n,m)=>n+Math.max(0,Number(m.payoutRemaining)||0),0);
 });
 const unpaid=Math.max(0,expected-received), net=udharTotal-jamaTotal+unpaid-unused;
 const salesChange=ovCompare(currentTotalSales,previousTotalSales), expenseChange=ovCompare(expenseTotal,previousExpenseTotal);
 const months=[];
 for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),key=ovMonthKey(d);
  months.push({label:d.toLocaleDateString("en-IN",{month:"short"}),profit:ovSum(sales.filter(s=>ovMonthKeyFromDate(s.date)===key),s=>s.profit)});
 }
 const max=Math.max(1,...months.map(m=>Math.abs(m.profit)));
 const bars=months.map(m=>{
  const h=Math.max(3,Math.round(Math.abs(m.profit)/max*100));
  return '<div class="ov-chart-column"><div class="ov-chart-value">'+ovMoney(m.profit)+'</div><div class="ov-chart-track"><div class="ov-chart-bar '+(m.profit<0?'negative':'')+'" style="height:'+h+'%"></div></div><span>'+m.label+'</span></div>';
 }).join("");
 const salesFoot=previousTotalSales>0?'<span class="'+salesChange.className+'">'+salesChange.text+'</span> vs previous month':(currentTotalSales>0?'Sales recorded; no previous-month base':'No sales recorded this month');
 const expenseFoot=previousExpenseTotal>0?'<span class="'+expenseChange.className+'">'+expenseChange.text+'</span> vs previous month':(expenseTotal>0?'Expenses recorded; no previous-month base':'No house expenses or losses this month');
 const netClass=net>0?'positive':net<0?'negative':'';
 const netLabel=net>0?'Net amount to receive':net<0?'Net amount payable':'Receivables and liabilities balanced';
 const customers=new Set(udharRecords.map(r=>r.customerMobile||r.customerName||'unknown'));
 return '<div class="stats-grid ov-stats-grid">'+
 ovStat('Total sales',ovMoney(currentTotalSales),salesFoot,'↗')+
 '<div class="stat-card"><div class="stat-top">Total receivables<span class="stat-icon">⇄</span></div><div class="stat-value '+netClass+'">'+ovMoney(Math.abs(net))+(net<0?' payable':'')+'</div><div class="stat-foot '+netClass+'">'+netLabel+'</div></div>'+
 ovStat('Total expenses',ovMoney(expenseTotal),expenseFoot,'↘')+
 ovStat('Previous month profit',ovMoney(previousProfit),previousDate.toLocaleDateString('en-IN',{month:'long',year:'numeric'}),'◈')+
 '</div><div class="ov-lower-grid"><section class="panel ov-profit-panel"><div class="panel-head"><div><h3>Monthly profit</h3><div class="panel-sub">Invoice profit over the last 12 months</div></div><button class="muted-link" data-page="reports">View reports →</button></div><div class="ov-chart">'+bars+'</div></section>'+
 '<section class="panel ov-alert-panel"><div class="panel-head"><div><h3>Pending attention</h3><div class="panel-sub">Outstanding balances that need follow-up</div></div></div>'+
 '<div class="ov-alert-item"><span class="ov-alert-icon udhar">!</span><div class="ov-alert-copy"><b>Outstanding Udhar</b><small>'+udharRecords.length+' outstanding record(s) · '+customers.size+' customer(s)</small></div><strong>'+ovMoney(udharTotal)+'</strong></div>'+
 '<div class="ov-alert-item"><span class="ov-alert-icon committee">◎</span><div class="ov-alert-copy"><b>Unpaid committee contributions</b><small>Expected monthly contributions still unpaid</small></div><strong>'+ovMoney(unpaid)+'</strong></div>'+
 '<div class="ov-alert-footer">Current month: '+now.toLocaleDateString('en-IN',{month:'long',year:'numeric'})+'</div></section></div>';
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
    renderNetWorthPage();
    return "";
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
function render(key){
 currentPage=key;$("#crumb").textContent=pageInfo[key][0];$("#pageTitle").textContent=key==="overview"?"Good evening, Admin 👋":pageInfo[key][0];$("#pageSubtitle").textContent=pageInfo[key][1];
 pageContent.innerHTML=key==="overview"?overview():renderModule(key);
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===key));
 $("#featureMenu").classList.remove("open");$("#featureButton").setAttribute("aria-expanded","false");
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
$("#today").textContent=new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
render("overview");
