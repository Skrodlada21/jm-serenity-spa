/*
 * J&M Serenity Spa — Admin/Desk bilingual overlay (English + Simplified Chinese).
 * When toggled on, appends the 中文 next to recognized interface labels.
 * Only runs on admin/desk pages (this script is only included in those headers).
 * Customer-facing pages and TV boards are untouched. Data (names, notes) is
 * never translated — only UI "chrome" tags (nav, buttons, headings, labels, etc.).
 */
(function () {
  var KEY = "jm_lang";
  // We translate any visible text node whose FULL text is an exact dictionary
  // match. The dictionary holds only interface terms, so client data (names,
  // amounts, notes) never matches. These tags are skipped outright.
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, TITLE: 1 };

  var DICT = {
    // ---- Admin navigation ----
    "Dashboard": "仪表板", "Easy Mode": "简易模式", "Phone Booking": "电话预约",
    "Therapists": "按摩师", "Services": "服务项目", "Clients": "客户", "Reports": "报告",
    "Blocked": "休息时间", "Waitlist": "候补名单", "Gifts": "礼品卡", "Reviews": "评价",
    "Gallery": "相册", "Memberships": "会员", "Discounts": "折扣", "Expenses": "开支",
    "Documents": "文件", "Settings": "设置", "Logout": "退出",
    // ---- Front-desk navigation ----
    "Today": "今天", "New Booking": "新预约", "Gift Cards": "礼品卡", "Members": "会员", "Prep Board": "准备清单",
    // ---- Buttons / actions ----
    "Add": "添加", "Edit": "编辑", "Delete": "删除", "Save": "保存", "Save Changes": "保存更改",
    "Save Settings": "保存设置", "Cancel": "取消", "Print": "打印", "Label": "标签",
    "Preview": "预览", "Send": "发送", "Search": "搜索", "Filter": "筛选", "Back": "返回",
    "View": "查看", "Update": "更新", "Upload": "上传", "Upload Photo": "上传照片",
    "Upload Document": "上传文件", "Remove": "移除", "Remove Employee": "移除员工",
    "Approve": "批准", "Redeem": "兑换", "Charge": "收费", "Complete": "完成", "Pause": "暂停",
    "Renew": "续订", "Reactivate": "重新激活", "Re-hire": "重新雇用", "Unlock": "解锁",
    "Record Payment": "记录付款", "Save Payment": "保存付款", "Mark Paid": "标记已付",
    "Mark as Paid": "标记为已付", "Collect Payment": "收取付款", "Use Visit": "使用一次",
    "Add Expense": "添加开支", "Add Service": "添加服务", "Add Add-On": "添加附加项目",
    "Add Therapist": "添加按摩师", "Add Block": "添加休息时间", "Add Blocked Time": "添加休息时间",
    "Add a Document": "添加文件", "Add-Ons": "附加项目", "Copy All Emails": "复制所有邮箱",
    "Copy to Clipboard": "复制", "Print Label": "打印标签", "Print Gift Card": "打印礼品卡",
    "Print Member Card": "打印会员卡", "Draft with AI": "AI 起草", "Preview Email": "预览邮件",
    "Send Update Email": "发送更新邮件", "Send Manually": "手动发送", "Contacted": "已联系",
    "Reset Test Data": "重置测试数据", "Send to Square Terminal": "发送到 Square 终端",
    "Back to Settings": "返回设置", "Back to Signups": "返回注册列表", "Log In": "登录",
    "Create Membership Plan": "创建会员套餐", "Issue New Gift Certificate": "开具新礼品券",
    "Open Front Desk": "打开前台",
    // ---- Table headers / field labels ----
    "Status": "状态", "Actions": "操作", "Date": "日期", "Time": "时间", "Phone": "电话",
    "Name": "姓名", "Service": "服务", "Client": "客户", "Category": "类别", "Amount": "金额",
    "Amount Used": "已用金额", "Description": "描述", "Notes": "备注", "Vendor": "商家",
    "Frequency": "频率", "Price": "价格", "Duration": "时长", "Email": "邮箱", "Code": "代码",
    "Balance": "余额", "Total": "总计", "Total Tips": "小费总计", "Tip": "小费", "Tips": "小费",
    "Source": "来源", "Plan": "套餐", "Rating": "评分", "Review": "评价", "Reason": "原因",
    "Title": "标题", "Size": "大小", "Day": "日", "Hour": "小时", "Visits": "次数",
    "Visits Left": "剩余次数", "Sessions": "疗程", "Revenue": "营收", "Daily Revenue": "每日营收",
    "Remaining": "剩余", "Purchaser": "购买人", "Recipient": "收礼人", "Bookings": "预约",
    "Payment": "付款", "Text": "短信", "Discount": "折扣", "Areas": "部位", "Created By": "创建人",
    "Redeemed By": "兑换人", "Last Visit": "上次到访", "Times Used": "使用次数",
    "Preferred Date": "首选日期", "Due Date": "到期日", "Certificate": "礼券", "Visits/mo": "每月次数",
    "Price/mo": "每月价格", "Name / Partner": "姓名 / 搭档", "Therapist": "按摩师", "Signed Up": "注册日期",
    // ---- Statuses ----
    "Paid": "已付", "Due": "待付", "Active": "有效", "Cancelled": "已取消", "Completed": "已完成",
    "No Show": "未到", "Paused": "已暂停", "Added": "已添加", "Confirmed": "已确认",
    // ---- Payment methods ----
    "Cash": "现金", "Credit Card": "信用卡", "Debit Card": "借记卡", "Gift Card": "礼品卡",
    "Credit Card (manual)": "信用卡（手动）", "Pay with Gift Card": "用礼品卡支付",
    // ---- Service categories ----
    "Full Body (room)": "全身按摩（房间）", "Couples (room)": "情侣按摩（房间）",
    "Chair Station": "座椅按摩", "Foot Chair": "足部按摩椅", "Combo (room + foot)": "组合（房间+足部）",
    "Four Hands (room, 2 therapists)": "四手按摩（房间，2位按摩师）",
    "Water Head Massage (table)": "水疗头部按摩（按摩床）",
    // ---- Genders / prefs ----
    "Female": "女", "Male": "男", "Female therapist": "女按摩师", "Male therapist": "男按摩师",
    "No preference": "无偏好", "Enabled": "已启用", "Disabled": "已禁用",
    // ---- Headings ----
    "Expense Tracking": "开支跟踪", "Compose Update": "撰写更新",
    "Send Update to Subscribers": "向订阅者发送更新", "Gift Certificate": "礼品券",
    "Gift Certificates": "礼品券", "Manage Therapists": "管理按摩师", "Manage Services": "管理服务",
    "Manage Reviews": "管理评价", "Reports & Analytics": "报告与分析", "Client Lookup": "客户查询",
    "Member Lookup": "会员查询", "Upcoming Appointments": "即将到来的预约", "Coming Up Next": "接下来",
    "Who's Owed Money": "欠款对象", "Daily Summary": "每日汇总", "Popular Services": "热门服务",
    "Therapist Performance": "按摩师业绩", "Busiest Times of Day": "一天中最忙时段",
    "Busiest Days of Week": "一周中最忙日", "Business Info": "商家信息", "Google Maps": "谷歌地图",
    "Redemption History": "兑换记录", "Past Updates": "过往更新", "Email Preview": "邮件预览",
    "Email Signups": "邮件注册", "Saved Documents": "已保存文件", "Gallery Management": "相册管理",
    "Blocked Times / Days Off": "休息时间 / 休息日", "Screen Locked": "屏幕已锁定",
    "Coming Soon Mode": "即将开业模式", "Change Admin Password": "修改管理员密码",
    "Front Desk PIN": "前台密码", "Hours & Scheduling": "营业时间与排班",
    "Room & Station Counts": "房间与工位数量", "Discount Codes & Partnerships": "折扣码与合作",
    // ---- Expense categories ----
    "Rent": "房租", "Utilities": "水电费", "Supplies": "用品", "Linens": "布草", "Insurance": "保险",
    "Marketing": "营销", "Payroll": "工资", "Equipment": "设备", "Maintenance": "维护",
    "Software": "软件", "Licensing": "执照", "Furniture": "家具", "Build-Out": "装修",
    "Signage": "标牌", "General": "一般", "Other": "其他",
    // ---- Document categories ----
    "Licenses": "执照", "Contracts": "合同", "Lease / Landlord": "租约 / 房东",
    // ---- Misc common ----
    "Search": "搜索", "One-Time": "一次性", "Monthly Recurring": "每月定期",
    "Yearly Recurring": "每年定期", "Massages": "按摩", "Massage": "按摩", "Add-On": "附加项目",
    // ---- Expanded: deeper admin/desk screens (2nd pass) ----
    "Price ($)": "价格（$）", "Amount ($)": "金额（$）", "Tip ($)": "小费（$）",
    "Monthly Price ($)": "每月价格（$）", "Fixed Amount ($)": "固定金额（$）", "Percentage (%)": "百分比（%）",
    "Discount %": "折扣百分比", "Client Name": "客户姓名", "Payment Method": "付款方式",
    "Payment Status": "付款状态", "Discount Code": "折扣码", "Discount Type": "折扣类型",
    "Duration (minutes)": "时长（分钟）", "Slot Interval (minutes)": "时段间隔（分钟）",
    "Start Time": "开始时间", "End Time": "结束时间", "Open Time": "开门时间", "Close Time": "打烊时间",
    "Start Date": "开始日期", "End Date": "结束日期", "Open Days": "营业日", "Work Days": "工作日",
    "Work Schedule": "工作排班", "Reminder Time": "提醒时间", "Good For": "适用于", "Photo": "照片",
    "Image": "图片", "File": "文件", "Receipt": "收据", "Caption": "说明文字", "Sort Order": "排序",
    "Featured": "精选", "Gender": "性别", "Therapist(s)": "按摩师", "Second Therapist": "第二位按摩师",
    "Therapist Preference": "按摩师偏好", "Your PIN": "您的密码", "Your Employee PIN": "您的员工密码",
    "Employee PIN": "员工密码", "Desk PIN": "前台密码", "PIN": "密码", "Password": "密码",
    "New Password": "新密码", "About / Bio": "简介 / 个人介绍", "Short Bio / Specialties": "简短介绍 / 专长",
    "Access Token": "访问令牌", "Location ID": "位置 ID", "Device ID": "设备 ID", "Environment": "环境",
    "Model": "模型", "Type": "类型", "Value": "数值", "Method": "方式", "Note": "备注",
    "Notes for Therapist": "给按摩师的备注", "Message": "留言", "Personal Message": "个人留言",
    "Subject": "主题", "Address": "地址", "Add / Edit Expense": "添加 / 编辑开支",
    "Add New Add-On": "添加新附加项目", "Add New Member": "添加新会员", "Addon Credits": "附加项目额度",
    "Admin Login": "管理员登录", "Amount to Redeem": "兑换金额",
    "Areas to Focus On": "重点部位", "Auto-Reminders": "自动提醒", "By Category": "按类别",
    "Chair Stations": "座椅工位", "Couples Rooms": "情侣房间", "Foot Chairs": "足部按摩椅",
    "Full Body Rooms": "全身按摩房间", "Water Head Massage Tables": "水疗头部按摩床",
    "Completed By": "完成人", "Done By": "操作人", "Guest Passes Per Month": "每月访客通行证",
    "Visits Per Month": "每月次数", "How It Works": "使用方法", "Included Services": "包含的服务",
    "Membership Plan": "会员套餐", "Member": "会员", "Plan Name": "套餐名称", "Recurring": "定期",
    "Phone Number": "电话号码", "Phone Number ID": "电话号码 ID", "Phone Number or Name": "电话号码或姓名",
    "Purchaser Name": "购买人姓名", "Purchaser Email": "购买人邮箱", "Recipient Name": "收礼人姓名",
    "Gift Cert Code": "礼品券代码", "Gift Certificate Code": "礼品券代码", "Spa Name": "水疗名称",
    "Description (optional)": "描述（可选）", "Vendor / Where": "商家 / 地点", "What / Who": "内容 / 对象",
    "Embed URL": "嵌入网址", "From Address": "发件地址",
    "SMTP Host": "SMTP 主机", "SMTP Port": "SMTP 端口", "SMTP User": "SMTP 用户", "SMTP Password": "SMTP 密码",
    "OpenPhone API Key": "OpenPhone API 密钥", "OpenRouter API Key": "OpenRouter API 密钥",
    "Square Subscription ID": "Square 订阅 ID", "Due To": "应付给", "Owe To": "应还给", "Paid By": "付款人",
    "Ready to Go Live?": "准备上线？", "Preview Coming Soon Page": "预览即将开业页面",
    "View Email Signups": "查看邮件注册", "Search by name, phone, or email": "按姓名、电话或邮箱搜索",
    "Services This Therapist Can Perform": "该按摩师可提供的服务", "NOT PAID": "未付款", "MEMBER": "会员",
    "On Schedule": "在排班", "Off Schedule": "不在排班", "Fired": "已解雇", "Fired / Let Go": "已解雇 / 辞退",
    "They Left / Quit": "已离职 / 辞职", "Walk-In": "散客", "Other Payment": "其他付款",
    "Cash Done": "现金完成", "Send to Terminal": "发送到终端", "Danger Zone": "危险区域",
    "Owe Someone Back — They paid out of pocket": "需还款 — 有人垫付", "Paid — All settled": "已付 — 全部结清",
    "Due — Bill not paid yet": "待付 — 账单尚未支付", "To:": "致：", "From:": "来自：", "Totals for": "合计",
    "Select —": "选择 —", "Pick One —": "选择一项 —", "Choose a service —": "选择服务 —",
    "Select Plan —": "选择套餐 —", "Same —": "相同 —", "Same as booked —": "与预约相同 —",
    "Select a time to continue": "选择时间以继续", "All Expenses (by month)": "所有开支（按月）",
    "All Recurring (all)": "所有定期（全部）", "All Unpaid (all)": "所有未付（全部）",
    "Bills Due (all)": "待付账单（全部）", "Monthly Recurring (all)": "每月定期（全部）",
    "Yearly Recurring (all)": "每年定期（全部）", "Startup Costs (all)": "启动成本（全部）",
    "Needs Reimbursement (all)": "需报销（全部）", "Email Notifications (SMTP)": "邮件通知（SMTP）",
    "Text Message Reminders (OpenPhone)": "短信提醒（OpenPhone）", "Square Payments (Terminal)": "Square 支付（终端）",
    "AI Email Assistant (OpenRouter)": "AI 邮件助手（OpenRouter）", "Email Not Configured Yet": "邮件尚未配置",
    "Sandbox (Testing)": "沙盒（测试）", "Production (Live)": "生产环境（正式）",
    "Clear All Test Data & Start Fresh": "清除所有测试数据并重新开始"
  };

  function isBi() { try { return localStorage.getItem(KEY) === "bi"; } catch (e) { return false; } }

  window.jmToggleLang = function () {
    try { localStorage.setItem(KEY, isBi() ? "en" : "bi"); } catch (e) {}
    location.reload();
  };

  function norm(s) {
    return s.replace(/\s+/g, " ").trim().replace(/^[^A-Za-z0-9]+/, "").trim();
  }

  function translate() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p || p.id === "jm-lang-btn" || SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var zh = DICT[norm(node.nodeValue)];
      if (!zh) return;
      var span = document.createElement("span");
      span.className = "jm-zh";
      span.style.cssText = "color:#c9a96e;margin-left:4px;font-weight:400;";
      span.textContent = zh;
      node.parentNode.insertBefore(span, node.nextSibling);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("jm-lang-btn");
    if (btn) btn.textContent = isBi() ? "English" : "中文";
    if (isBi()) translate();
  });
})();
