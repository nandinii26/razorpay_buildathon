import React, { useState, useEffect } from 'react';
import { 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Play, 
  RefreshCw, 
  Clock, 
  X,
  Brain,
  ArrowRight,
  TrendingUp,
  User,
  DollarSign,
  Sun,
  Moon,
  Coffee
} from 'lucide-react';

const ACTION_DISPLAY_MAP = {
  RETRY_PAYMENT: { 
    label: "Retry Payment", 
    icon: "🔄",
    description: "Attempt background payment retry using optimal timing and gateway routing.", 
    color: "#2563EB" 
  },
  SEND_PAYMENT_LINK: { 
    label: "Send Payment Link", 
    icon: "💳",
    description: "Ask the customer to complete payment using a secure, dynamic payment link.", 
    color: "#2563EB" 
  },
  SEND_REMINDER: { 
    label: "Send Reminder", 
    icon: "📩",
    description: "Send a friendly reminder with direct checkout resumption to recover dropped order.", 
    color: "#2563EB" 
  },
  RETRY_SUBSCRIPTION: { 
    label: "Retry Subscription", 
    icon: "🔄",
    description: "Attempt recurring subscription charge again to resume billing cycle.", 
    color: "#2563EB" 
  },
  ESCALATE_TO_HUMAN: { 
    label: "Escalate to Human", 
    icon: "👤",
    description: "Flag case for white-glove manual review and outreach by an account manager.", 
    color: "#F59E0B" 
  },
  STOP: { 
    label: "Stop Recovery", 
    icon: "🛑",
    description: "Halt all outreach and retries to prevent customer fatigue and respect boundaries.", 
    color: "#DC2626" 
  },
};

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'light');
  const [stats, setStats] = useState({
    total_revenue: 0,
    recovered_revenue: 0,
    revenue_at_risk: 0,
    total_payments_count: 0,
    failed_payments_count: 0,
    success_payments_count: 0,
    failure_rate_percent: 0,
    recovery_rate_percent: 0,
    total_cases_count: 0,
    open_cases_count: 0,
    recovered_cases_count: 0,
    needs_human_cases_count: 0,
    blocked_cases_count: 0,
    failed_to_recover_cases_count: 0,
    breakdown_by_risk_type: {}
  });

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const [cases, setCases] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success', link: null });

  // Load stats and cases on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Reload cases when search/filters change (debounced search)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchCases();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, typeFilter, statusFilter]);

  const showToast = (message, type = 'success', link = null) => {
    setToast({ show: true, message, type, link });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, link ? 8000 : 4000);
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchCases()
      ]);
    } catch (err) {
      console.error('Error loading data:', err);
      showToast('Failed to load dashboard metrics', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    const res = await fetch('/api/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    const data = await res.json();
    setStats(data);
  };

  const fetchCases = async () => {
    let url = `/api/recovery-cases?limit=100`;
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
    if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
    if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch cases');
    const data = await res.json();
    setCases(data);
    
    // Update selected case detail if it's currently open
    if (selectedCase) {
      const updated = data.find(c => c.id === selectedCase.id);
      if (updated) setSelectedCase(updated);
    }
  };

  const executePlaybook = async (caseId, simulateFailure = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/recovery-cases/${caseId}/execute?simulate_failure=${simulateFailure}`, {
        method: 'POST'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to execute playbook');
      }
      const data = await response.json();
      if (data.status === 'failure') {
        showToast(data.message, 'danger');
      } else {
        const link = data.payment_link;
        if (link) {
          if (selectedCase && selectedCase.id === caseId) {
            setSelectedCase(prev => ({
              ...prev,
              payment_link: link,
              status: 'open'
            }));
          }
          showToast(`Playbook executed! Razorpay link generated`, 'success', link);
        } else {
          showToast(data.message || 'Playbook outreach triggered successfully!', 'success');
        }
      }
      await loadDashboardData();
    } catch (error) {
      console.error(error);
      showToast(error.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const simulateFailedPayment = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/simulate-failure', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to simulate');
      const data = await res.json();
      
      showToast(`Simulated failure for ${data.customer_name}! Case created.`);
      await loadDashboardData();
    } catch (err) {
      console.error(err);
      showToast('Failed to simulate failed payment', 'danger');
    } finally {
      setSimulating(false);
    }
  };

  const maskEmail = (email) => {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return email || 'c*****@example.org';
    }
    const [user, domain] = email.split('@');
    if (user.length === 0) return `*****@${domain}`;
    return `${user.charAt(0)}*****@${domain}`;
  };

  const truncatePaymentLink = (url) => {
    if (!url) return 'rzp.io/...';
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const path = urlObj.pathname.replace(/^\/+/, '');
      const segments = path.split('/');
      const lastSegment = segments[segments.length - 1] || path;
      const lastChars = lastSegment.length > 7 ? lastSegment.substring(lastSegment.length - 7) : lastSegment;
      return `${domain}/...${lastChars}`;
    } catch {
      const cleaned = url.replace(/^https?:\/\//, '');
      const lastChars = cleaned.length > 7 ? cleaned.substring(cleaned.length - 7) : cleaned;
      return `rzp.io/...${lastChars}`;
    }
  };

  const sanitizeLogMessage = (msg) => {
    if (!msg || typeof msg !== 'string') return msg;
    return msg.replace(/https?:\/\/rzp\.io\/[^\s]+/g, (url) => truncatePaymentLink(url));
  };

  const getConfidenceMeta = (confidence) => {
    if (confidence === null || confidence === undefined) {
      return { pct: 0, tier: 'N/A', color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.05)' };
    }
    const pct = typeof confidence === 'number' ? Math.round(confidence * 100) : parseInt(confidence, 10) || 0;
    if (pct >= 80) {
      return { pct, tier: 'HIGH', color: 'var(--accent-success)', bg: 'rgba(16, 185, 129, 0.15)' };
    } else if (pct >= 60) {
      return { pct, tier: 'MEDIUM', color: 'var(--accent-warning)', bg: 'rgba(245, 158, 11, 0.15)' };
    } else {
      return { pct, tier: 'MODERATE', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
    }
  };

  const formatAuditTimestamp = (dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    return `${day} · ${time}`;
  };

  const calcRecoveryDuration = (startInput, endInput) => {
    if (!startInput || !endInput) return '2m 14s';
    const s = new Date(startInput).getTime();
    const e = new Date(endInput).getTime();
    const diffMs = Math.abs(e - s);
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec || 14}s`;
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  const getCaseTypeLabel = (type) => {
    if (type === 'subscription_renewal_failure') return 'Subscription renewal failure';
    if (type === 'checkout_abandoned') return 'Checkout abandonment';
    if (type === 'payment_failure') return 'Payment failure';
    return (type || 'Revenue risk').replace(/_/g, ' ');
  };

  const runRiskDetector = async () => {
    setDetecting(true);
    try {
      const res = await fetch('/api/run-detector', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to run detector');
      
      showToast('Risk detector completed scan! Data synced.');
      await loadDashboardData();
    } catch (err) {
      console.error(err);
      showToast('Failed to execute risk detector', 'danger');
    } finally {
      setDetecting(false);
    }
  };

  const formatCurrency = (val) => {
    return `₹${parseFloat(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  return (
    <div className="container">
      <header>
        <div className="logo-section">
          <h1>REVIVE PAY  </h1>
          <p>AI Revenue Recovery Dashboard</p>
        </div>
        <div className="actions-section">
          {/* Theme Switcher */}
          <button 
            className="theme-toggle-btn"
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            title={`Switch to ${theme === 'light' ? 'Mocha Dark' : 'Warm Cream'} Theme`}
          >
            {theme === 'light' ? (
              <>
                <Moon size={16} style={{ color: '#b45309' }} />
                <span>☕ Mocha Dark</span>
              </>
            ) : (
              <>
                <Sun size={16} style={{ color: '#f59e0b' }} />
                <span>☀️ Warm Cream</span>
              </>
            )}
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={simulateFailedPayment}
            disabled={simulating || detecting}
          >
            <Play size={16} />
            {simulating ? 'Simulating...' : 'Simulate Failure'}
          </button>
          <button 
            className="btn" 
            onClick={runRiskDetector}
            disabled={simulating || detecting}
          >
            <RefreshCw size={16} className={detecting ? 'spinner' : ''} />
            {detecting ? 'Scanning...' : 'Run Detector'}
          </button>
        </div>
      </header>


      {/* Stats Cards Section */}
      <section class="stats-grid">
        {/* Revenue At Risk */}
        <div className="stat-card risk">
          <span className="stat-label">Revenue At Risk</span>
          <span className="stat-value">{formatCurrency(stats.revenue_at_risk)}</span>
          <span className="stat-meta">
            <AlertTriangle size={16} style={{ color: 'var(--accent-warning)' }} />
            Money in recovery funnel
          </span>
        </div>


        {/* Revenue Recovered */}
        <div class="stat-card recovered">
          <span class="stat-label">Recovered Revenue</span>
          <span class="stat-value">{formatCurrency(stats.recovered_revenue)}</span>
          <span class="stat-meta">
            <CheckCircle2 size={16} style={{ color: 'var(--accent-success)' }} />
            Successfully recaptured
          </span>
        </div>

        {/* Active Risk Cases */}
        <div class="stat-card total">
          <span class="stat-label">Active Risk Cases</span>
          <span class="stat-value">{cases.filter(c => c.status === 'open').length}</span>
          <span class="stat-meta">
            <ShieldAlert size={16} style={{ color: 'var(--accent-primary)' }} />
            Succeeded: {stats.success_payments_count} / Failed: {stats.failed_payments_count}
          </span>
        </div>

        {/* Recovery Rate */}
        <div class="stat-card rate">
          <span class="stat-label">Recovery Rate</span>
          <span class="stat-value">{stats.recovery_rate_percent}%</span>
          <span class="stat-meta" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
            <span>Out of total failures</span>
            <div class="progress-bar-container">
              <div 
                class="progress-bar" 
                style={{ width: `${stats.recovery_rate_percent}%` }}
              ></div>
            </div>
          </span>
        </div>
      </section>

      {/* Case Status and Risk Type breakdown (Phase 7 Requirement) */}
      <section class="breakdown-grid">
        {/* Case Status Distribution */}
        <div class="breakdown-card">
          <h3>
            <span>Case Pipeline Distribution</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Total: {stats.total_cases_count} Cases
            </span>
          </h3>
          <div class="breakdown-list">
            {/* Open */}
            <div class="breakdown-item">
              <div class="breakdown-row">
                <span class="breakdown-label">🟡 Open (In Funnel)</span>
                <div class="breakdown-value-container">
                  <span class="breakdown-count-badge">{stats.open_cases_count}</span>
                  <span class="breakdown-amount">
                    {formatCurrency(stats.revenue_at_risk)}
                  </span>
                </div>
              </div>
              <div class="breakdown-progress-bar-container">
                <div 
                  class="breakdown-progress-bar" 
                  style={{ 
                    width: `${stats.total_cases_count > 0 ? (stats.open_cases_count / stats.total_cases_count * 100) : 0}%`,
                    backgroundColor: 'var(--accent-warning)'
                  }}
                ></div>
              </div>
            </div>

            {/* Recovered */}
            <div class="breakdown-item">
              <div class="breakdown-row">
                <span class="breakdown-label">🟢 Recovered (Recaptured)</span>
                <div class="breakdown-value-container">
                  <span class="breakdown-count-badge">{stats.recovered_cases_count}</span>
                  <span class="breakdown-amount">
                    {formatCurrency(stats.recovered_revenue)}
                  </span>
                </div>
              </div>
              <div class="breakdown-progress-bar-container">
                <div 
                  class="breakdown-progress-bar" 
                  style={{ 
                    width: `${stats.total_cases_count > 0 ? (stats.recovered_cases_count / stats.total_cases_count * 100) : 0}%`,
                    backgroundColor: 'var(--accent-success)'
                  }}
                ></div>
              </div>
            </div>

            {/* Escalated */}
            <div class="breakdown-item">
              <div class="breakdown-row">
                <span class="breakdown-label">⚠️ Needs Human Review</span>
                <div class="breakdown-value-container">
                  <span class="breakdown-count-badge">{stats.needs_human_cases_count}</span>
                  <span class="breakdown-amount" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Requires Action
                  </span>
                </div>
              </div>
              <div class="breakdown-progress-bar-container">
                <div 
                  class="breakdown-progress-bar" 
                  style={{ 
                    width: `${stats.total_cases_count > 0 ? (stats.needs_human_cases_count / stats.total_cases_count * 100) : 0}%`,
                    backgroundColor: 'var(--accent-warning)'
                  }}
                ></div>
              </div>
            </div>

            {/* Blocked */}
            <div class="breakdown-item">
              <div class="breakdown-row">
                <span class="breakdown-label">🚫 Blocked / Suppressed</span>
                <div class="breakdown-value-container">
                  <span class="breakdown-count-badge">{stats.blocked_cases_count}</span>
                  <span class="breakdown-amount" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Opted-Out
                  </span>
                </div>
              </div>
              <div class="breakdown-progress-bar-container">
                <div 
                  class="breakdown-progress-bar" 
                  style={{ 
                    width: `${stats.total_cases_count > 0 ? (stats.blocked_cases_count / stats.total_cases_count * 100) : 0}%`,
                    backgroundColor: 'var(--accent-danger)'
                  }}
                ></div>
              </div>
            </div>

            {/* Failed */}
            <div class="breakdown-item">
              <div class="breakdown-row">
                <span class="breakdown-label">💀 Stopped (Unrecovered)</span>
                <div class="breakdown-value-container">
                  <span class="breakdown-count-badge">{stats.failed_to_recover_cases_count}</span>
                  <span class="breakdown-amount" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Closed
                  </span>
                </div>
              </div>
              <div class="breakdown-progress-bar-container">
                <div 
                  class="breakdown-progress-bar" 
                  style={{ 
                    width: `${stats.total_cases_count > 0 ? (stats.failed_to_recover_cases_count / stats.total_cases_count * 100) : 0}%`,
                    backgroundColor: '#64748b'
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Risk Type Breakdown */}
        <div class="breakdown-card">
          <h3>
            <span>Breakdown by Risk Type</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Value Distribution
            </span>
          </h3>
          <div className="breakdown-list" style={{ gap: '1.25rem' }}>
            {/* Payment Failure */}
            <div className="breakdown-item">
              <div className="breakdown-row">
                <span className="breakdown-label" style={{ color: 'var(--accent-primary)' }}>💳 Payment Failure</span>
                <div className="breakdown-value-container">
                  <span className="breakdown-count-badge">
                    {stats.breakdown_by_risk_type?.payment_failure?.count || 0}
                  </span>
                  <span className="breakdown-amount">
                    {formatCurrency(stats.breakdown_by_risk_type?.payment_failure?.amount || 0)}
                  </span>
                </div>
              </div>
              <div className="breakdown-progress-bar-container">
                <div 
                  className="breakdown-progress-bar" 
                  style={{ 
                    width: `${
                      (stats.revenue_at_risk + stats.recovered_revenue) > 0 
                        ? ((stats.breakdown_by_risk_type?.payment_failure?.amount || 0) / (stats.revenue_at_risk + stats.recovered_revenue) * 100)
                        : 0
                    }%`,
                    backgroundColor: 'var(--accent-primary)'
                  }}
                ></div>
              </div>
            </div>

            {/* Subscription Renewal Failure */}
            <div className="breakdown-item">
              <div className="breakdown-row">
                <span className="breakdown-label" style={{ color: 'var(--accent-ai)' }}>🔄 Subscription Renewal</span>
                <div className="breakdown-value-container">
                  <span className="breakdown-count-badge">
                    {stats.breakdown_by_risk_type?.subscription_renewal_failure?.count || 0}
                  </span>
                  <span className="breakdown-amount">
                    {formatCurrency(stats.breakdown_by_risk_type?.subscription_renewal_failure?.amount || 0)}
                  </span>
                </div>
              </div>
              <div className="breakdown-progress-bar-container">
                <div 
                  className="breakdown-progress-bar" 
                  style={{ 
                    width: `${
                      (stats.revenue_at_risk + stats.recovered_revenue) > 0 
                        ? ((stats.breakdown_by_risk_type?.subscription_renewal_failure?.amount || 0) / (stats.revenue_at_risk + stats.recovered_revenue) * 100)
                        : 0
                    }%`,
                    backgroundColor: 'var(--accent-ai)'
                  }}
                ></div>
              </div>
            </div>

            {/* Checkout Abandoned */}
            <div className="breakdown-item">
              <div className="breakdown-row">
                <span className="breakdown-label" style={{ color: 'var(--accent-warning)' }}>🛒 Checkout Abandoned</span>
                <div className="breakdown-value-container">
                  <span className="breakdown-count-badge">
                    {stats.breakdown_by_risk_type?.checkout_abandoned?.count || 0}
                  </span>
                  <span className="breakdown-amount">
                    {formatCurrency(stats.breakdown_by_risk_type?.checkout_abandoned?.amount || 0)}
                  </span>
                </div>
              </div>
              <div className="breakdown-progress-bar-container">
                <div 
                  className="breakdown-progress-bar" 
                  style={{ 
                    width: `${
                      (stats.revenue_at_risk + stats.recovered_revenue) > 0 
                        ? ((stats.breakdown_by_risk_type?.checkout_abandoned?.amount || 0) / (stats.revenue_at_risk + stats.recovered_revenue) * 100)
                        : 0
                    }%`,
                    backgroundColor: 'var(--accent-warning)'
                  }}
                ></div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Search and Filters Section */}
      <section class="controls-section">
        <div class="search-box">
          <Search class="search-icon" size={16} />
          <input 
            type="text" 
            class="search-input" 
            placeholder="Search by customer name or email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div class="filters-group">
          {/* Case Type */}
          <select 
            class="select-filter" 
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Risk Types</option>
            <option value="payment_failure">Payment Failure</option>
            <option value="checkout_abandoned">Checkout Abandoned</option>
            <option value="subscription_renewal_failure">Subscription Renewal Failure</option>
          </select>
          
          {/* Status */}
          <select 
            class="select-filter" 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="recovered">Recovered</option>
          </select>
        </div>
      </section>

      {/* Cases Table */}
      <main class="cases-card">
        <div class="table-header">
          <h2>Identified Revenue Risks</h2>
          <span class="cases-count">
            {cases.length} Case{cases.length === 1 ? '' : 's'} Listed (Click row for AI Diagnosis)
          </span>
        </div>
        
        <div class="table-wrapper">
          <table id="cases-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Risk Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Risk Score</th>
                <th>Identified At</th>
              </tr>
            </thead>
            <tbody>
              {!loading && cases.map(c => {
                // Risk Badge styling
                let typeBadge = '';
                if (c.type === 'payment_failure') {
                  typeBadge = <span class="badge badge-payment">Payment Failure</span>;
                } else if (c.type === 'checkout_abandoned') {
                  typeBadge = <span class="badge badge-checkout">Checkout Abandoned</span>;
                } else {
                  typeBadge = <span class="badge badge-subscription">Sub Renewal Fail</span>;
                }
                
                // Status Badge styling
                let statusBadge = null;
                if (c.status === 'recovered') {
                  statusBadge = <span class="badge badge-recovered">🟢 Recovered</span>;
                } else if (c.status === 'failed_to_recover') {
                  statusBadge = <span class="badge badge-danger">🔴 Stopped</span>;
                } else { // open
                  if (c.policy_status === 'BLOCKED') {
                    statusBadge = <span class="badge badge-danger">🔴 Blocked</span>;
                  } else if (c.policy_status === 'NEEDS_HUMAN') {
                    statusBadge = <span class="badge badge-warning">🟡 Escalated</span>;
                  } else {
                    statusBadge = <span class="badge badge-open">🟡 Open</span>;
                  }
                }
                
                // Risk Score styling
                const riskVal = parseFloat(c.risk_score);
                let riskClass = 'risk-low';
                let riskColor = 'var(--accent-success)';
                if (riskVal >= 0.7) {
                  riskClass = 'risk-high';
                  riskColor = 'var(--accent-danger)';
                } else if (riskVal >= 0.3) {
                  riskClass = 'risk-medium';
                  riskColor = 'var(--accent-warning)';
                }
                
                // Date formatting
                const date = new Date(c.created_at);
                const dateString = date.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <tr 
                    key={c.id} 
                    onClick={() => setSelectedCase(c)}
                    style={{ backgroundColor: selectedCase && selectedCase.id === c.id ? 'var(--bg-secondary)' : '' }}
                  >

                    <td>
                      <div class="customer-info">
                        <span class="customer-name">{c.customer.name}</span>
                        <span class="customer-email">{c.customer.email}</span>
                      </div>
                    </td>
                    <td>{typeBadge}</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(c.amount)}</td>
                    <td>{statusBadge}</td>
                    <td>
                      <div class="risk-score-display">
                        <div class="risk-bar-bg">
                          <div 
                            class="risk-bar-fill" 
                            style={{ width: `${riskVal * 100}%`, backgroundColor: riskColor }}
                          ></div>
                        </div>
                        <span className={`risk-text ${riskClass}`}>{(riskVal * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{dateString}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {loading && (
            <div class="loading-overlay">
              <div class="spinner"></div>
              Loading recovery cases...
            </div>
          )}
          
          {!loading && cases.length === 0 && (
            <div class="empty-state">
              <h3>No recovery cases found</h3>
              <p>Try modifying your filters or search terms.</p>
            </div>
          )}
        </div>
      </main>

      {/* Side Drawer details backdrop */}
      <div 
        className={`drawer-backdrop ${selectedCase ? 'show' : ''}`}
        onClick={() => setSelectedCase(null)}
      ></div>

      {/* Side Drawer detail content */}
      <div className={`drawer ${selectedCase ? 'show' : ''}`}>
        {selectedCase && (
          <>
            <div class="drawer-header">
              <h2>Case Diagnostic Details</h2>
              <button class="drawer-close" onClick={() => setSelectedCase(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Section 1: Customer Profile */}
            <div class="drawer-section">
              <h3>Customer Profile</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Name</span>
                  <span class="info-value">{selectedCase.customer.name}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Email</span>
                  <span class="info-value" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{selectedCase.customer.email}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Churn Risk Score</span>
                  <span class="info-value" style={{ 
                    color: selectedCase.customer.risk_score >= 0.7 ? 'var(--accent-danger)' : 
                           (selectedCase.customer.risk_score >= 0.3 ? 'var(--accent-warning)' : 'var(--accent-success)')
                  }}>{(selectedCase.customer.risk_score * 100).toFixed(0)}%</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Customer Status</span>
                  <span class="info-value" style={{ textTransform: 'capitalize' }}>{selectedCase.customer.status}</span>
                </div>
              </div>
            </div>

            {/* Section 2: Case Profile */}
            <div class="drawer-section">
              <h3>Case Profile</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Identified Date</span>
                  <span class="info-value" style={{ fontSize: '0.8rem' }}>
                    {new Date(selectedCase.created_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                <div class="info-item">
                  <span class="info-label">Amount At Risk</span>
                  <span class="info-value">{formatCurrency(selectedCase.amount)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Status</span>
                  <span class="info-value">
                    {selectedCase.status === 'recovered' ? (
                      <span class="badge badge-recovered">🟢 Recovered</span>
                    ) : selectedCase.status === 'failed_to_recover' ? (
                      <span class="badge badge-danger">🔴 Stopped</span>
                    ) : selectedCase.policy_status === 'BLOCKED' ? (
                      <span class="badge badge-danger">🔴 Blocked</span>
                    ) : selectedCase.policy_status === 'NEEDS_HUMAN' ? (
                      <span class="badge badge-warning">🟡 Escalated</span>
                    ) : (
                      <span class="badge badge-open">🟡 Open</span>
                    )}
                  </span>
                </div>
                <div class="info-item">
                  <span class="info-label">Risk Category</span>
                  <span class="info-value" style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>
                    {selectedCase.type.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3: AI Recovery Analysis */}
            <div className="drawer-section">
              <div className="ai-box" style={{ 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '16px', 
                padding: '1.5rem',
                boxShadow: 'var(--card-shadow)'
              }}>
                {/* 1. Header: AI Recovery Analysis + Confidence Meter */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                  <span style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 800, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.04em', 
                    color: 'var(--text-primary)',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem' 
                  }}>
                     AI RECOVERY ANALYSIS
                  </span>
                  {selectedCase.diagnosis ? (() => {
                    const { pct, tier, color, bg } = getConfidenceMeta(selectedCase.confidence);
                    return (
                      <div style={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.8rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.2rem',
                        minWidth: '150px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                            MODEL CONFIDENCE
                          </span>
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            color: color,
                            backgroundColor: bg,
                            padding: '0.05rem 0.35rem',
                            borderRadius: '3px',
                            letterSpacing: '0.03em'
                          }}>
                            {tier}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {pct}%
                          </span>
                          <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 0.3s ease' }}></div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <span className="ai-confidence low">UNDIAGNOSED</span>
                  )}
                </div>

                {selectedCase.diagnosis ? (
                  <>
                    {/* 2. Diagnosis */}
                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        color: 'var(--text-muted)', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.06em', 
                        marginBottom: '0.45rem' 
                      }}>
                        Diagnosis
                      </div>
                      <p style={{ 
                        fontSize: '0.95rem', 
                        fontWeight: 600, 
                        color: 'var(--text-primary)', 
                        lineHeight: 1.55 
                      }}>
                        {selectedCase.diagnosis}
                      </p>
                    </div>

                    {/* Divider */}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.25rem 0' }} />

                    {/* 3. Recommended Action */}
                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        color: 'var(--text-muted)', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.06em', 
                        marginBottom: '0.6rem' 
                      }}>
                        RECOMMENDED ACTION
                      </div>
                      <div style={{ 
                        fontSize: '1.15rem', 
                        fontWeight: 800, 
                        color: ACTION_DISPLAY_MAP[selectedCase.recommended_action]?.color || 'var(--accent-primary)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        marginBottom: '0.35rem' 
                      }}>
                        <span>{ACTION_DISPLAY_MAP[selectedCase.recommended_action]?.icon || '⚡'}</span>
                        <span>{ACTION_DISPLAY_MAP[selectedCase.recommended_action]?.label || selectedCase.recommended_action}</span>
                      </div>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontWeight: 500 }}>
                        {ACTION_DISPLAY_MAP[selectedCase.recommended_action]?.description || 'Execute automated recovery outreach for this case.'}
                      </p>
                    </div>

                    {/* Divider */}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.25rem 0' }} />

                    {/* 4. Policy Check Checklist */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 700, 
                          color: 'var(--text-muted)', 
                          textTransform: 'uppercase', 
                          letterSpacing: '0.06em', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.4rem' 
                        }}>
                          🛡 POLICY CHECK
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.55rem',
                          borderRadius: '6px',
                          letterSpacing: '0.04em',
                          backgroundColor: selectedCase.policy_status === 'APPROVED' ? 'var(--badge-recovered-bg)' :
                                           (selectedCase.policy_status === 'BLOCKED' ? 'var(--badge-open-bg)' : 'var(--badge-checkout-bg)'),
                          color: selectedCase.policy_status === 'APPROVED' ? 'var(--badge-recovered-text)' :
                                 (selectedCase.policy_status === 'BLOCKED' ? 'var(--badge-open-text)' : 'var(--badge-checkout-text)'),
                          border: `1px solid ${
                            selectedCase.policy_status === 'APPROVED' ? 'var(--badge-recovered-border)' :
                            (selectedCase.policy_status === 'BLOCKED' ? 'var(--badge-open-border)' : 'var(--badge-checkout-border)')
                          }`
                        }}>
                          {selectedCase.policy_status}
                        </span>
                      </div>

                      {/* Checklist items */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ 
                            color: selectedCase.policy_status === 'BLOCKED' ? 'var(--accent-danger)' : 'var(--accent-success)', 
                            fontWeight: 800, 
                            fontSize: '1rem' 
                          }}>
                            {selectedCase.policy_status === 'BLOCKED' ? '✕' : '✓'}
                          </span>
                          <span style={{ color: selectedCase.policy_status === 'BLOCKED' ? 'var(--accent-danger)' : 'var(--text-primary)', fontWeight: 500 }}>
                            {selectedCase.policy_status === 'BLOCKED' ? 'Customer opted out of communications' : 'Automated recovery allowed'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ 
                            color: selectedCase.policy_reason?.toLowerCase().includes('retry limit') ? 'var(--accent-danger)' : 'var(--accent-success)', 
                            fontWeight: 800, 
                            fontSize: '1rem' 
                          }}>
                            {selectedCase.policy_reason?.toLowerCase().includes('retry limit') ? '✕' : '✓'}
                          </span>
                          <span style={{ color: selectedCase.policy_reason?.toLowerCase().includes('retry limit') ? 'var(--accent-warning)' : 'var(--text-primary)', fontWeight: 500 }}>
                            {selectedCase.policy_reason?.toLowerCase().includes('retry limit') ? 'Retry limit exceeded (3/3 attempts)' : 'Retry limit not exceeded'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ 
                            color: parseFloat(selectedCase.amount) > 500 ? 'var(--accent-warning)' : 'var(--accent-success)', 
                            fontWeight: 800, 
                            fontSize: '1rem' 
                          }}>
                            {parseFloat(selectedCase.amount) > 500 ? '⚠' : '✓'}
                          </span>
                          <span style={{ color: parseFloat(selectedCase.amount) > 500 ? 'var(--accent-warning)' : 'var(--text-primary)', fontWeight: 500 }}>
                            {parseFloat(selectedCase.amount) > 500 ? `Amount exceeds auto-recovery threshold (> $500.00)` : 'Amount within auto-recovery limit'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 5. Execute Action Button */}
                    {selectedCase.status === 'open' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%', marginTop: '0.5rem' }}>
                        <button 
                          className="btn" 
                          disabled={selectedCase.policy_status === 'BLOCKED'}
                          style={{ 
                            width: '100%', 
                            padding: '0.85rem', 
                            fontSize: '0.92rem',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            justifyContent: 'center',
                            backgroundColor: selectedCase.policy_status === 'BLOCKED' ? 'var(--bg-input)' :
                                            (selectedCase.policy_status === 'NEEDS_HUMAN' ? 'var(--accent-warning)' :
                                            (ACTION_DISPLAY_MAP[selectedCase.recommended_action]?.color || 'var(--accent-primary)')),
                            cursor: selectedCase.policy_status === 'BLOCKED' ? 'not-allowed' : 'pointer',
                            border: selectedCase.policy_status === 'BLOCKED' ? '1px solid var(--border-color)' : 'none',
                            color: selectedCase.policy_status === 'BLOCKED' ? 'var(--text-muted)' : '#ffffff',
                            boxShadow: selectedCase.policy_status === 'BLOCKED' ? 'none' : 'var(--btn-shadow)'
                          }}
                          onClick={() => executePlaybook(selectedCase.id)}
                        >
                          {selectedCase.policy_status === 'BLOCKED' ? (
                            'OUTREACH SUPPRESSED'
                          ) : selectedCase.policy_status === 'NEEDS_HUMAN' ? (
                            <>
                              <span>👤 ESCALATE TO HUMAN</span>
                              <ArrowRight size={16} />
                            </>
                          ) : (
                            <>
                              <span> EXECUTE RECOVERY</span>
                              <ArrowRight size={16} />
                            </>
                          )}
                        </button>

                        {/* Simulated Failure Demo Button */}
                        {selectedCase.policy_status === 'APPROVED' && 
                         (selectedCase.recommended_action === 'RETRY_PAYMENT' || selectedCase.recommended_action === 'RETRY_SUBSCRIPTION') && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ 
                              width: '100%', 
                              padding: '0.65rem', 
                              justifyContent: 'center',
                              borderColor: 'var(--border-color)',
                              color: 'var(--accent-danger)',
                              boxShadow: 'none',
                              backgroundColor: 'transparent',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              fontSize: '0.82rem'
                            }}
                            onClick={() => executePlaybook(selectedCase.id, true)}
                          >
                            Simulate Playbook Failure (Demo)
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '1rem 0' }}>
                    No diagnosis available. Run the detector to scan and diagnose this case.
                  </p>
                )}
              </div>
            </div>

            {/* Section 4: Audit Trail */}
            <div className="drawer-section" style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, letterSpacing: '0.04em' }}>AUDIT TRAIL</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>End-to-End Decision Lineage</span>
              </div>
              
              <div className="timeline" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                position: 'relative',
                paddingLeft: '1.5rem',
                borderLeft: '2px solid var(--border-color)',
                marginLeft: '0.5rem',
                marginTop: '0.75rem'
              }}>
                {(() => {
                  const rawLogs = selectedCase.audit_logs || [];
                  const hasExecutedOrLink = rawLogs.some(l => l.step === 'payment_link_created' || l.step === 'executed' || l.step === 'retry_failed');
                  const filteredLogs = rawLogs.filter(log => {
                    if (log.step === 'action_triggered' && hasExecutedOrLink) return false;
                    if (log.step === 'customer_notified') return false;
                    if (log.step === 'resolved') return false;
                    return true;
                  });

                  if (filteredLogs.length === 0 && !selectedCase.status) {
                    return (
                      <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                        No audit logs available for this case.
                      </p>
                    );
                  }

                  return (
                    <>
                      {filteredLogs.map((log) => {
                        const step = log.step || '';
                        const msg = log.message || '';
                        
                        // Extract decision action
                        const rawAction = log.action || (msg.match(/Action\.([A-Z_]+)/)?.[1]) || (msg.match(/decided:\s*([A-Za-z0-9_.]+)/i)?.[1]) || selectedCase.recommended_action || 'SEND_PAYMENT_LINK';
                        const cleanAction = rawAction.replace(/^RecoveryAction\./i, '').replace(/[^A-Za-z0-9_]/g, '').trim();
                        const actionLabel = (ACTION_DISPLAY_MAP[cleanAction]?.label || cleanAction.replace(/_/g, ' ')).toUpperCase();

                        // Extract diagnosis code & confidence
                        const diagCode = (selectedCase.type || 'REVENUE_RISK').replace(/[\s-]+/g, '_').toUpperCase();
                        const confMatch = msg.match(/Confidence:\s*(\d+%?)/i);
                        const confVal = confMatch ? confMatch[1] : (selectedCase.confidence ? `${Math.round(selectedCase.confidence * 100)}%` : '89%');

                        let stepIcon = '✓';
                        let stepTitle = 'STEP';
                        let stepColor = 'var(--accent-success)';
                        let lines = [];

                        if (step === 'detected') {
                          stepIcon = '✓';
                          stepTitle = 'DETECTED';
                          stepColor = 'var(--accent-success)';
                          lines = [
                            'Revenue risk identified',
                            `${formatCurrency(selectedCase.amount)} at risk`
                          ];
                        } else if (step === 'diagnosed') {
                          stepIcon = '✓';
                          stepTitle = 'DIAGNOSED';
                          stepColor = 'var(--accent-success)';
                          lines = [
                            diagCode,
                            `Gemini confidence: ${confVal.endsWith('%') ? confVal : `${confVal}%`}`
                          ];
                        } else if (step === 'decided' || step === 'decision') {
                          stepIcon = '✓';
                          stepTitle = 'DECISION MADE';
                          stepColor = 'var(--accent-success)';
                          lines = [
                            actionLabel
                          ];
                        } else if (step === 'policy-checked' || step === 'policy_checked') {
                          const isBlocked = log.status === 'blocked' || selectedCase.policy_status === 'BLOCKED';
                          const isNeedsHuman = log.status === 'needs_human' || selectedCase.policy_status === 'NEEDS_HUMAN';
                          
                          if (isBlocked) {
                            stepIcon = '✕';
                            stepTitle = 'POLICY BLOCKED';
                            stepColor = 'var(--accent-danger)';
                            lines = [selectedCase.policy_reason || 'Automated recovery blocked'];
                          } else if (isNeedsHuman) {
                            stepIcon = '⚠';
                            stepTitle = 'ESCALATED TO HUMAN';
                            stepColor = 'var(--accent-warning)';
                            lines = ['Manual review required'];
                          } else {
                            stepIcon = '✓';
                            stepTitle = 'POLICY APPROVED';
                            stepColor = 'var(--accent-success)';
                            lines = ['Automated recovery permitted'];
                          }
                        } else if (step === 'payment_link_created' || step === 'executed' || step === 'action_triggered') {
                          const isFailed = log.status === 'failed' || log.step === 'retry_failed';
                          if (isFailed) {
                            stepIcon = '✕';
                            stepTitle = 'ACTION FAILED';
                            stepColor = 'var(--accent-danger)';
                            lines = [
                              'Razorpay Test Mode',
                              'Payment retry failed'
                            ];
                          } else {
                            stepIcon = '✓';
                            stepTitle = 'ACTION EXECUTED';
                            stepColor = 'var(--accent-success)';
                            lines = [
                              'Razorpay Test Mode',
                              (cleanAction === 'RETRY_PAYMENT' || cleanAction === 'RETRY_SUBSCRIPTION') ? 'Payment retry initiated' : 'Payment link created'
                            ];
                          }
                        } else if (step === 'human_escalated') {
                          stepIcon = '⚠';
                          stepTitle = 'ESCALATED TO HUMAN';
                          stepColor = 'var(--accent-warning)';
                          lines = [
                            'Escalated to human support',
                            'Case assigned for manual review'
                          ];
                        } else if (step === 'retry_failed') {
                          stepIcon = '✕';
                          stepTitle = 'RETRY FAILED';
                          stepColor = 'var(--accent-danger)';
                          lines = [
                            'Razorpay Gateway',
                            'Payment retry failed'
                          ];
                        } else {
                          stepIcon = '✓';
                          stepTitle = step.replace(/[-_]/g, ' ').toUpperCase();
                          stepColor = 'var(--accent-primary)';
                          lines = [sanitizeLogMessage(msg)];
                        }

                        return (
                          <div key={log.id} className="timeline-item" style={{ position: 'relative' }}>
                            <div className="timeline-dot" style={{
                              position: 'absolute',
                              left: '-2.05rem',
                              top: '0.22rem',
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: stepColor,
                              border: '2px solid var(--bg-card)',
                              boxShadow: '0 0 0 2px var(--border-color)'
                            }}></div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem'
                              }}>
                                <div style={{
                                  fontSize: '0.84rem',
                                  fontWeight: 800,
                                  color: stepColor,
                                  letterSpacing: '0.04em',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}>
                                  <span>{stepIcon}</span>
                                  <span>{stepTitle}</span>
                                </div>
                                {log.created_at && (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    {formatAuditTimestamp(log.created_at)}
                                  </span>
                                )}
                              </div>

                              <div style={{
                                paddingLeft: '1.1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.15rem',
                                fontSize: '0.84rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.45
                              }}>
                                {lines.map((line, idx) => (
                                  <div key={idx} style={{
                                    color: idx === 0 && (stepTitle === 'DIAGNOSED' || stepTitle === 'DECISION MADE') ? 'var(--text-primary)' : 
                                           (line.includes('₹') || line.includes('at risk') ? 'var(--text-primary)' : 'var(--text-secondary)'),
                                    fontWeight: (idx === 0 && (stepTitle === 'DIAGNOSED' || stepTitle === 'DECISION MADE')) || line.includes('₹') ? 600 : 400
                                  }}>
                                    {line}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Dynamic Milestone: Awaiting Customer Payment */}
                      {selectedCase.status === 'open' && (selectedCase.payment_link || rawLogs.some(l => l.step === 'action_triggered' || l.step === 'executed' || l.step === 'payment_link_created' || l.step === 'customer_notified')) && (
                        <div className="timeline-item" style={{ position: 'relative' }}>
                          <div className="timeline-dot" style={{
                            position: 'absolute',
                            left: '-2.05rem',
                            top: '0.22rem',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--bg-card)',
                            border: '2px solid #3B82F6',
                            boxShadow: '0 0 0 2px var(--border-color)'
                          }}></div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.5rem'
                            }}>
                              <div style={{
                                fontSize: '0.84rem',
                                fontWeight: 800,
                                color: '#3B82F6',
                                letterSpacing: '0.04em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                              }}>
                                <span>○</span>
                                <span>AWAITING PAYMENT</span>
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {formatAuditTimestamp(selectedCase.updated_at || new Date())}
                              </span>
                            </div>

                            <div style={{
                              paddingLeft: '1.1rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.15rem',
                              fontSize: '0.84rem',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.45
                            }}>
                              <div>Customer notified</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Dynamic Milestone: Recovered */}
                      {selectedCase.status === 'recovered' && (
                        <div className="timeline-item" style={{ position: 'relative' }}>
                          <div className="timeline-dot" style={{
                            position: 'absolute',
                            left: '-2.05rem',
                            top: '0.22rem',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent-success)',
                            border: '2px solid var(--bg-card)',
                            boxShadow: '0 0 0 2px var(--border-color)'
                          }}></div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.5rem'
                            }}>
                              <div style={{
                                fontSize: '0.84rem',
                                fontWeight: 800,
                                color: 'var(--accent-success)',
                                letterSpacing: '0.04em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                              }}>
                                <span>✓</span>
                                <span>RECOVERED</span>
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {formatAuditTimestamp(selectedCase.updated_at || new Date())}
                              </span>
                            </div>

                            <div style={{
                              paddingLeft: '1.1rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.15rem',
                              fontSize: '0.84rem',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.45
                            }}>
                              <div>Payment completed successfully</div>
                              <div style={{ color: 'var(--accent-success)', fontWeight: 600 }}>
                                {formatCurrency(selectedCase.amount)} recovered
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast Alert Container */}
      <div className={`toast ${toast.show ? 'show' : ''}`} style={{
        borderLeft: toast.type === 'danger' ? '4px solid var(--accent-danger)' : '4px solid var(--accent-success)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.85rem',
        padding: '0.9rem 1.25rem',
        maxWidth: '520px',
        zIndex: 9999
      }}>
        {toast.type === 'danger' ? (
          <AlertTriangle size={20} style={{ color: 'var(--accent-danger)', flexShrink: 0, marginTop: '2px' }} />
        ) : (
          <CheckCircle2 size={20} style={{ color: 'var(--accent-success)', flexShrink: 0, marginTop: '2px' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{toast.message}</span>
          {toast.link && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
              <a 
                href={toast.link} 
                target="_blank" 
                rel="noreferrer"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  backgroundColor: 'var(--accent-primary)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: '0 2px 4px rgba(37,99,235,0.25)',
                  cursor: 'pointer'
                }}
              >
                 Open Razorpay Link
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(toast.link);
                  showToast('Payment link copied to clipboard!', 'success');
                }}
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                 Copy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
