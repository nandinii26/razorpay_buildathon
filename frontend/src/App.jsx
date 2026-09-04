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
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

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

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
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
        const msg = data.payment_link 
          ? `Playbook executed! Razorpay Link: ${data.payment_link}` 
          : (data.message || 'Playbook outreach triggered successfully!');
        showToast(msg, 'success');
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
          <h1>AI Revenue Recovery Dashboard</h1>
          <p>Real-time Risk Detection, ML Diagnostics & Recovery Playbooks</p>
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
                {/* 1. Header: AI Recovery Analysis + Confidence Badge */}
                <div className="ai-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <span style={{ 
                    fontSize: '0.92rem', 
                    fontWeight: 800, 
                    letterSpacing: '0.04em', 
                    color: 'var(--text-primary)',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem' 
                  }}>
                    🧠 AI RECOVERY ANALYSIS
                  </span>
                  {selectedCase.diagnosis ? (
                    <span style={{ 
                      fontSize: '0.8rem', 
                      fontWeight: 800, 
                      letterSpacing: '0.04em',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--accent-primary)',
                      border: '1px solid var(--border-color)'
                    }}>
                      {Math.round(selectedCase.confidence * 100)}% CONFIDENCE
                    </span>
                  ) : (
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
                              <span>⚡ EXECUTE RECOVERY</span>
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
              <h3>Audit Trail Log</h3>
              <div className="timeline" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative',
                paddingLeft: '1.5rem',
                borderLeft: '2px solid var(--border-color)',
                marginLeft: '0.5rem',
                marginTop: '0.5rem'
              }}>
                {selectedCase.audit_logs && selectedCase.audit_logs.length > 0 ? (
                  selectedCase.audit_logs.map((log) => {
                    let color = 'var(--text-secondary)';
                    if (log.step === 'detected') color = 'var(--accent-primary)';
                    if (log.step === 'diagnosed') color = 'var(--accent-ai)';
                    if (log.step === 'decided') color = 'var(--accent-primary)';
                    if (log.step === 'policy-checked') {
                      color = log.status === 'blocked' ? 'var(--accent-danger)' :
                              (log.status === 'needs_human' ? 'var(--accent-warning)' : 'var(--accent-success)');
                    }
                    if (log.step === 'executed') color = 'var(--accent-primary)';
                    if (log.step === 'resolved') color = 'var(--accent-success)';

                    return (
                      <div key={log.id} className="timeline-item" style={{ position: 'relative' }}>
                        <div className="timeline-dot" style={{
                          position: 'absolute',
                          left: '-2.05rem',
                          top: '0.25rem',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: color,
                          border: '2px solid var(--bg-card)',
                          boxShadow: `0 0 0 2px var(--border-color)`
                        }}></div>
                        
                        <div className="timeline-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: 700, 
                            textTransform: 'uppercase',
                            color: color,
                            letterSpacing: '0.02em'
                          }}>
                            {log.step.replace(/-/g, ' ')}
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.35 }}>
                            {log.message}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {new Date(log.created_at).toLocaleString('en-IN', {
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                              day: '2-digit', month: 'short'
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                    No audit logs available for this case.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast Alert Container */}
      <div className={`toast ${toast.show ? 'show' : ''}`} style={{
        borderLeft: toast.type === 'danger' ? '4px solid var(--accent-danger)' : '4px solid var(--accent-success)'
      }}>
        {toast.type === 'danger' ? (
          <AlertTriangle size={20} style={{ color: 'var(--accent-danger)' }} />
        ) : (
          <CheckCircle2 size={20} style={{ color: 'var(--accent-success)' }} />
        )}
        <span>{toast.message}</span>
      </div>
    </div>
  );
}

export default App;
