import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation, NavLink } from 'react-router-dom';
import { 
  Users, 
  BookOpen, 
  GraduationCap, 
  LayoutDashboard, 
  ClipboardList, 
  CreditCard, 
  FileText,
  LogOut,
  UserCircle,
  Link as LinkIcon,
  BarChart3,
  CheckCircle,
  AlertCircle,
  UserPlus,
  PlusCircle,
  Trash2,
  X,
  Eye,
  Info,
  MapPin,
  Phone,
  User,
  Calendar,
  Download,
  Menu,
  RefreshCw,
} from 'lucide-react';
import {
  MSG,
  messageForHttpStatus,
  loginMessageForStatus,
  connectionCheckingMessage,
  connectionOkMessage,
  connectionUnavailableMessage,
} from './userMessages';

/** Build and download a CSV file. rows: array of arrays (first = header) or array of objects. */
function downloadCsv(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = Array.isArray(rows[0]) && rows[0].length
    ? rows.map((row) => row.map(escape).join(','))
    : rows.length
      ? [Object.keys(rows[0]).map(escape).join(','), ...rows.map((row) => Object.values(row).map(escape).join(','))]
      : [];
  const csv = lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Updated Mock Data for K-12 and Levels
const INITIAL_COURSES = [
  { id: 'ENG-BEG', name: 'English Fundamentals', level: 'Beginner', faculty: 'Ms. Aster' },
  { id: 'MATH-G5', name: 'Grade 5 Mathematics', level: 'Grade 5', faculty: 'Ato Solomon' },
  { id: 'SCI-G8', name: 'Grade 8 Integrated Science', level: 'Grade 8', faculty: 'W/ro Mulu' },
  { id: 'AMH-ADV', name: 'Advanced Amharic Literature', level: 'Advanced', faculty: 'Ato Kebede' },
];

const INITIAL_STUDENTS = [
  { 
    id: 'STU001', 
    name: 'Yohannes Tesfaye', 
    email: 'yohannes@edu.et', 
    status: 'Active', 
    balance: 1200, 
    level: 'Grade 10',
    age: 16,
    gender: 'Male',
    phone: '+251 911 223344',
    location: 'Addis Ababa, Bole'
  },
  { 
    id: 'STU002', 
    name: 'Sara Bekele', 
    email: 'sara.b@edu.et', 
    status: 'Active', 
    balance: 0, 
    level: 'Intermediate',
    age: 19,
    gender: 'Female',
    phone: '+251 912 556677',
    location: 'Addis Ababa, Sarbet'
  },
  { 
    id: 'STU003', 
    name: 'Dawit Mengistu', 
    email: 'dawit.m@edu.et', 
    status: 'Probation', 
    balance: 450, 
    level: 'Advanced',
    age: 22,
    gender: 'Male',
    phone: '+251 910 889900',
    location: 'Adama, City Center'
  },
];

const SIS_TOKEN_KEY = 'sis_token';
const SIS_TENANT_KEY = 'sis_tenant';
const SITE_STUDENTS_CACHE_PREFIX = 'sis_site_students_';

function siteStudentsCacheKey() {
  const tenant =
    typeof window !== 'undefined' ? window.localStorage.getItem(SIS_TENANT_KEY) || 'ecamel' : 'ecamel';
  return `${SITE_STUDENTS_CACHE_PREFIX}${tenant}`;
}

function readSiteStudentsCache() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(siteStudentsCacheKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.students)) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSiteStudentsCache(students, cachedAt) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      siteStudentsCacheKey(),
      JSON.stringify({
        students,
        cached_at: cachedAt || new Date().toISOString(),
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

const OVERVIEW_CACHE_PREFIX = 'sis_overview_';

function overviewCacheKey() {
  const tenant =
    typeof window !== 'undefined' ? window.localStorage.getItem(SIS_TENANT_KEY) || 'ecamel' : 'ecamel';
  return `${OVERVIEW_CACHE_PREFIX}${tenant}`;
}

function readOverviewCache() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(overviewCacheKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeOverviewCache(metrics) {
  if (typeof window === 'undefined' || !metrics) return;
  try {
    sessionStorage.setItem(overviewCacheKey(), JSON.stringify(metrics));
  } catch {
    // ignore
  }
}

function clearOverviewCache() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(overviewCacheKey());
  } catch {
    // ignore
  }
}

function clearSiteStudentsCache() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(siteStudentsCacheKey());
  } catch {
    // ignore
  }
}

function isOverviewCacheFull(cached) {
  return (
    cached &&
    cached.partial !== true &&
    typeof cached.total_students === 'number'
  );
}

function fetchOverviewMetrics(url) {
  return apiFetch(url).then((res) =>
    res.ok ? res.json() : Promise.reject(new Error('metrics failed'))
  );
}

let overviewPrefetchPromise = null;

/** Shared admin dashboard prefetch (login + dashboard dedupe). */
function prefetchOverviewMetrics() {
  const cached = readOverviewCache();
  if (isOverviewCacheFull(cached)) {
    return Promise.resolve(cached);
  }

  if (!overviewPrefetchPromise) {
    overviewPrefetchPromise = (async () => {
      const fastUrl = '/api/moodle/overview-metrics?include_students=0';
      const fullUrl = '/api/moodle/overview-metrics?include_students=1';

      if (cached && cached.partial === true) {
        const full = await fetchOverviewMetrics(fullUrl);
        writeOverviewCache(full);
        return full;
      }

      const partial = await fetchOverviewMetrics(fastUrl);
      writeOverviewCache(partial);
      const full = await fetchOverviewMetrics(fullUrl);
      writeOverviewCache(full);
      return full;
    })().finally(() => {
      overviewPrefetchPromise = null;
    });
  }

  return overviewPrefetchPromise;
}

function applyOverviewMetrics(metrics, setters) {
  const {
    setGradeLevels,
    setTotalCourses,
    setTotalMoodleStudents,
    setStudentsByGrade,
    setMoodleOk,
    setChartReady,
  } = setters;
  if (typeof metrics.total_categories === 'number') {
    setGradeLevels(metrics.total_categories);
  }
  if (typeof metrics.total_courses === 'number') {
    setTotalCourses(metrics.total_courses);
  }
  if (typeof metrics.total_students === 'number') {
    setTotalMoodleStudents(metrics.total_students);
  }
  const perCat = Array.isArray(metrics.students_per_category) ? metrics.students_per_category : [];
  if (perCat.length > 0) {
    const counts = {};
    perCat.forEach((row) => {
      const name = row.category_name || `Category ${row.category_id}`;
      counts[name] = typeof row.student_count === 'number' ? row.student_count : 0;
    });
    setStudentsByGrade(counts);
    setChartReady(true);
  }
  setMoodleOk(true);
}

/** Sort grade/level labels naturally (GRADE 1, 2, … 10, not 1, 10, 11, 2). */
function compareGradeLevelNames(a, b) {
  const nameA = String(typeof a === 'string' ? a : a?.name ?? '').trim();
  const nameB = String(typeof b === 'string' ? b : b?.name ?? '').trim();
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

function sortGradeLevelCategories(categories) {
  return [...categories].sort(compareGradeLevelNames);
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Animate a number from 0 → target when enabled / value changes. */
function useCountUp(value, { duration = 900, delay = 0, enabled = true } = {}) {
  const target =
    value == null || Number.isNaN(Number(value)) ? null : Math.max(0, Math.round(Number(value)));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!enabled || target === null) {
      setDisplay(0);
      return undefined;
    }

    let raf = 0;
    let timeoutId = 0;

    const startAnimation = () => {
      const startAt = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - startAt) / duration);
        setDisplay(Math.round(target * easeOutCubic(t)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    if (delay > 0) timeoutId = window.setTimeout(startAnimation, delay);
    else startAnimation();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeoutId);
    };
  }, [target, duration, delay, enabled]);

  return target === null ? null : display;
}

function AnimatedStatNumber({ value, className, duration = 900, delay = 0 }) {
  const animated = useCountUp(value, { duration, delay, enabled: value != null });
  return (
    <p className={className}>{animated === null ? '—' : animated.toLocaleString()}</p>
  );
}

function StudentsPerGradeChart({ studentsByGrade }) {
  const entries = React.useMemo(
    () => Object.entries(studentsByGrade).sort((a, b) => Number(b[1]) - Number(a[1])),
    [studentsByGrade]
  );
  const max = React.useMemo(
    () => entries.reduce((m, [, v]) => Math.max(m, Number(v) || 0), 0) || 1,
    [entries]
  );
  const [barsLive, setBarsLive] = useState(false);
  const dataKey = React.useMemo(
    () => entries.map(([grade, count]) => `${grade}:${count}`).join('|'),
    [entries]
  );

  useEffect(() => {
    setBarsLive(false);
    if (entries.length === 0) return undefined;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setBarsLive(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [dataKey, entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2.5 dashboard-stat-enter" style={{ animationDelay: '120ms' }}>
      {entries.map(([grade, count], index) => {
        const targetWidth = Math.max(6, (Number(count) / max) * 100);
        const width = barsLive ? targetWidth : 0;
        const delayMs = index * 75;
        return (
          <GradeBarRow
            key={grade}
            grade={grade}
            count={Number(count) || 0}
            width={width}
            delayMs={delayMs}
            animate={barsLive}
          />
        );
      })}
    </div>
  );
}

function GradeBarRow({ grade, count, width, delayMs, animate }) {
  const displayCount = useCountUp(animate ? count : 0, {
    duration: 750,
    delay: delayMs,
    enabled: animate,
  });

  return (
    <div
      className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-xl hover:bg-indigo-50/60 transition-colors dashboard-stat-enter"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="w-20 sm:w-32 min-w-0 truncate text-gray-600 font-semibold">{grade}</div>
      <div className="flex-1 h-3.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-3.5 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 transition-[width] duration-700 ease-out"
          style={{
            width: `${width}%`,
            transitionDelay: `${delayMs}ms`,
          }}
        />
      </div>
      <div className="w-10 text-right text-gray-800 font-semibold tabular-nums">
        {displayCount.toLocaleString()}
      </div>
    </div>
  );
}

function applyAuthFromPayload(data, { setCurrentUser, setLmsName, setUserRole }) {
  const user = data?.user || null;
  if (!user) return;
  setCurrentUser(user);
  if (data.tenant && typeof window !== 'undefined') {
    window.localStorage.setItem(SIS_TENANT_KEY, data.tenant);
  }
  setLmsName(resolveLmsName(data.tenant, data.tenant_label));
  const rolesRaw = Array.isArray(user.roles) && user.roles.length ? user.roles : ['admin'];
  const roles = rolesRaw.filter((role) => SIS_ALLOWED_ROLES.includes(role));
  if (!roles.length) roles.push('student');
  const storedRole = typeof window !== 'undefined' ? window.localStorage.getItem(SIS_ACTIVE_ROLE_KEY) : null;
  const preferred = storedRole || (roles.includes('admin') ? 'admin' : roles[0]);
  const nextRole = roles.includes(preferred) ? preferred : roles[0];
  setUserRole(nextRole);
  if (data?.session) {
    persistSessionMeta(data.session);
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SIS_ACTIVE_ROLE_KEY, nextRole);
  }
}

const SIS_ACTIVE_ROLE_KEY = 'sis_active_role';
const SIS_LAST_ACTIVITY_KEY = 'sis_last_activity_at';
const SIS_SESSION_EXPIRES_KEY = 'sis_session_expires_at';
const SIS_IDLE_MINUTES_KEY = 'sis_idle_timeout_minutes';
const DEFAULT_IDLE_MINUTES = 360;
const SIS_ALLOWED_ROLES = ['admin', 'student'];

function parseIdleMinutesFromEnv() {
  const raw = import.meta.env.VITE_SIS_IDLE_TIMEOUT_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_MINUTES;
}

function getStoredIdleTimeoutMs() {
  if (typeof window === 'undefined') return DEFAULT_IDLE_MINUTES * 60 * 1000;
  const raw = window.localStorage.getItem(SIS_IDLE_MINUTES_KEY);
  const minutes = raw ? Number(raw) : parseIdleMinutesFromEnv();
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_IDLE_MINUTES;
  return safe * 60 * 1000;
}

function persistSessionMeta(session, { resetActivity = false } = {}) {
  if (typeof window === 'undefined' || !session) return;
  if (session.expires_at) {
    window.localStorage.setItem(SIS_SESSION_EXPIRES_KEY, String(session.expires_at));
  }
  if (session.idle_timeout_minutes != null) {
    window.localStorage.setItem(SIS_IDLE_MINUTES_KEY, String(session.idle_timeout_minutes));
  }
  if (resetActivity) {
    window.localStorage.setItem(SIS_LAST_ACTIVITY_KEY, String(Date.now()));
  }
}

function clearAuthStorage() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SIS_TOKEN_KEY);
  window.localStorage.removeItem(SIS_TENANT_KEY);
  window.localStorage.removeItem(SIS_ACTIVE_ROLE_KEY);
  window.localStorage.removeItem(SIS_LAST_ACTIVITY_KEY);
  window.localStorage.removeItem(SIS_SESSION_EXPIRES_KEY);
  window.localStorage.removeItem(SIS_IDLE_MINUTES_KEY);
}

function isIdleSessionExpired() {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(SIS_LAST_ACTIVITY_KEY);
  if (!raw) return false;
  const lastActivityAt = Number(raw);
  if (!Number.isFinite(lastActivityAt)) return false;
  return Date.now() - lastActivityAt >= getStoredIdleTimeoutMs();
}

function isSessionExpiredByInactivity() {
  return isIdleSessionExpired();
}

function readInitialAuthState() {
  if (typeof window === 'undefined') return { loggedIn: false };
  const token = window.localStorage.getItem(SIS_TOKEN_KEY);
  if (!token) return { loggedIn: false };
  if (isSessionExpiredByInactivity()) {
    clearAuthStorage();
    return { loggedIn: false };
  }
  return { loggedIn: true };
}

/** Shared nav labels, icons & URL paths (sidebar and address bar stay in sync). */
const SIS_NAV = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboard, path: 'dashboard' },
  curriculum: { label: 'Browse Grades', icon: GraduationCap, path: 'browse-grades' },
  moodle: { label: 'Grade Reports', icon: BarChart3, path: 'grade-reports' },
};

const PATH_TO_TAB = Object.fromEntries(
  Object.entries(SIS_NAV).map(([id, nav]) => [nav.path, id])
);

/** Old bookmarked URLs → current paths */
const LEGACY_ROUTE_REDIRECT = {
  curriculum: `/${SIS_NAV.curriculum.path}`,
  moodle: `/${SIS_NAV.moodle.path}`,
};
const LMS_NAME_FALLBACK = {
  ecamel: 'DNEC ECAMEL LMS',
  etss: 'DNEC ETSS LMS',
};

function resolveLmsName(tenantId, tenantLabel) {
  if (tenantLabel && String(tenantLabel).trim()) {
    return String(tenantLabel).trim();
  }
  const id = String(tenantId || 'ecamel').toLowerCase();
  return LMS_NAME_FALLBACK[id] || 'LMS';
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

function buildApiUrl(path) {
  if (!API_BASE_URL) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

function apiFetch(url, options = {}) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(SIS_TOKEN_KEY) : null;
  const tenant = typeof window !== 'undefined' ? window.localStorage.getItem(SIS_TENANT_KEY) : null;
  const activeRole = typeof window !== 'undefined' ? window.localStorage.getItem(SIS_ACTIVE_ROLE_KEY) : null;
  const headers = { ...options.headers };
  if (!headers['Accept'] && !headers['accept']) headers['Accept'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenant) headers['X-SIS-Tenant'] = tenant;
  if (activeRole && SIS_ALLOWED_ROLES.includes(activeRole)) headers['X-SIS-ROLE'] = activeRole;
  return fetch(buildApiUrl(url), { ...options, headers }).then((res) => {
    if (res.status === 401 && typeof window !== 'undefined') {
      if (document.hidden) {
        window.__sisPendingUnauthorized = true;
      } else {
        clearAuthStorage();
        if (window.__sisOnUnauthorized) window.__sisOnUnauthorized('expired');
      }
    }
    if (res.status === 403 && typeof window !== 'undefined') {
      if (window.__sisOnForbidden) window.__sisOnForbidden();
    }
    return res;
  });
}

function InlineStateMessage({ type = 'info', children }) {
  const tone =
    type === 'error'
      ? 'bg-red-50 border-red-100 text-red-700'
      : type === 'warning'
      ? 'bg-amber-50 border-amber-100 text-amber-700'
      : 'bg-indigo-50 border-indigo-100 text-indigo-700';
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${tone}`}>{children}</div>;
}

const LandingLogin = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenant, setTenant] = useState(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem(SIS_TENANT_KEY) || 'ecamel' : 'ecamel'
  );
  const [tenants, setTenants] = useState(() => {
    const initialTenant =
      typeof window !== 'undefined' ? window.localStorage.getItem(SIS_TENANT_KEY) || 'ecamel' : 'ecamel';
    return [{ id: initialTenant, label: resolveLmsName(initialTenant) }];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(buildApiUrl('/api/tenants'))
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.tenants) ? data.tenants : [];
        setTenants(list.length ? list : [{ id: tenant, label: resolveLmsName(tenant) }]);
        if (list.length > 0 && !list.some((t) => t.id === tenant)) {
          setTenant(data.default_tenant || list[0].id);
        }
      })
      .catch(() => {
        setTenants((prev) => (prev.length ? prev : [{ id: tenant, label: resolveLmsName(tenant) }]));
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError(MSG.AUTH_MISSING_FIELDS);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, tenant }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(loginMessageForStatus(res.status));
        return;
      }
      if (data.token && typeof window !== 'undefined') {
        window.localStorage.setItem(SIS_TOKEN_KEY, data.token);
        window.localStorage.setItem(SIS_TENANT_KEY, data.tenant || tenant);
        persistSessionMeta(data.session, { resetActivity: true });
        onLogin(data);
      } else {
        setError(MSG.AUTH_UNEXPECTED);
      }
    } catch {
      setError(MSG.AUTH_UNAVAILABLE);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md max-w-[100vw]">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-indigo-100">
          <div className="p-8 pb-6 bg-indigo-900 text-white text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white">SIS</h1>
            <p className="text-indigo-200 text-sm mt-2 uppercase tracking-widest font-semibold">Student Information System</p>
            <p className="text-indigo-300/90 text-xs mt-3 max-w-xs mx-auto">
              View grades and manage student information in one place.
            </p>
          </div>
          <form onSubmit={handleSubmit} autoComplete="off" className="p-8 pt-6 space-y-5">
            {error && (
              <p className="text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2 text-sm">{error}</p>
            )}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                LMS site
              </label>
              <select
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Username</label>
              <input
                type="text"
                placeholder="your DNEC user name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-70 transition-all shadow-lg shadow-indigo-100"
            >
              {loading ? 'Signing in…' : 'Sign in with DNEC account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const AppSidebarPanel = ({
  menuItems,
  userRole,
  currentUser,
  setUserRole,
  handleLogout,
  onNavigate,
}) => (
  <div className="flex flex-col flex-1 min-h-0">
    <div className="p-4 sm:p-6 border-b border-indigo-900 shrink-0">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">SIS</h1>
      <p className="text-indigo-400 text-xs uppercase tracking-widest mt-1 font-semibold">Student Information System</p>
    </div>

    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
      {menuItems[userRole].map((item) => (
        <NavLink
          key={item.id}
          to={`/${item.path}`}
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            `w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50' : 'text-indigo-300 hover:bg-indigo-900 hover:text-white'
            }`
          }
        >
          <item.icon size={20} />
          <span className="font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>

    <div className="p-4 border-t border-indigo-900 shrink-0 mt-auto">
      <div className="flex items-center space-x-3 mb-4 px-4 text-sm">
        <UserCircle size={20} className="text-indigo-400 shrink-0" />
        <div className="truncate min-w-0">
          <p className="text-[10px] text-indigo-500 font-bold uppercase mb-1">Signed in as</p>
          <p className="text-white text-sm font-semibold">{currentUser?.name || 'User'}</p>
          {(currentUser?.roles || []).length > 1 ? (
            <select
              value={userRole}
              onChange={(e) => {
                const next = e.target.value;
                setUserRole(next);
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(SIS_ACTIVE_ROLE_KEY, next);
                }
              }}
              className="mt-2 w-full bg-indigo-900 border border-indigo-700 rounded text-[11px] px-2 py-1 text-indigo-100"
            >
              {((currentUser?.roles || []).filter((r) => SIS_ALLOWED_ROLES.includes(r))).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-1 text-[11px] text-indigo-400 capitalize">{userRole}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => handleLogout()}
        className="w-full flex items-center space-x-3 px-4 py-3 text-indigo-400 hover:text-white hover:bg-indigo-900 rounded-xl transition-colors"
      >
        <LogOut size={18} />
        <span className="text-sm font-medium">Logout</span>
      </button>
    </div>
  </div>
);

const App = () => {
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(() => readInitialAuthState().loggedIn);
  const [currentUser, setCurrentUser] = useState(null);
  const [globalNotice, setGlobalNotice] = useState(null);
  const [userRole, setUserRole] = useState(() => {
    if (typeof window === 'undefined') return 'admin';
    return window.localStorage.getItem(SIS_ACTIVE_ROLE_KEY) || 'admin';
  });
  const [lmsName, setLmsName] = useState(() =>
    resolveLmsName(
      typeof window !== 'undefined' ? window.localStorage.getItem(SIS_TENANT_KEY) : 'ecamel',
      null
    )
  );
  const pathname = (location.pathname || '/').replace(/^\//, '') || SIS_NAV.dashboard.path;
  const activeTab = PATH_TO_TAB[pathname] ?? pathname;
  const [students, setStudents] = useState(INITIAL_STUDENTS);
  const [courses, setCourses] = useState(INITIAL_COURSES);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = React.useCallback(() => setSidebarOpen(false), []);

  React.useEffect(() => {
    closeSidebar();
  }, [pathname, closeSidebar]);

  const handleLogin = React.useCallback((session) => {
    if (session?.session) {
      persistSessionMeta(session.session, { resetActivity: true });
    } else if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIS_LAST_ACTIVITY_KEY, String(Date.now()));
    }
    if (session?.user) {
      applyAuthFromPayload(session, { setCurrentUser, setLmsName, setUserRole });
      const roles = Array.isArray(session.user.roles) ? session.user.roles : [];
      if (roles.includes('admin')) {
        prefetchOverviewMetrics().catch(() => {});
      }
    }
    setIsLoggedIn(true);
  }, []);

  const handleLogout = React.useCallback((reason) => {
    const hadToken = typeof window !== 'undefined' && !!window.localStorage.getItem(SIS_TOKEN_KEY);
    if (hadToken) {
      apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    }
    clearAuthStorage();
    setCurrentUser(null);
    setIsLoggedIn(false);
  }, []);

  React.useEffect(() => {
    window.__sisOnUnauthorized = (reason) => handleLogout(reason || 'expired');
    window.__sisOnForbidden = () => {
      setGlobalNotice({
        type: 'warning',
        message: MSG.PERMISSION_DENIED,
      });
    };
    return () => {
      window.__sisOnUnauthorized = null;
      window.__sisOnForbidden = null;
    };
  }, [handleLogout]);

  React.useEffect(() => {
    if (!isLoggedIn || currentUser) return;
    let cancelled = false;
    apiFetch('/api/me')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (cancelled) return;
        applyAuthFromPayload(data, { setCurrentUser, setLmsName, setUserRole });
      })
      .catch(() => {
        if (!cancelled) handleLogout('expired');
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, currentUser, handleLogout]);

  React.useEffect(() => {
    if (!isLoggedIn || typeof window === 'undefined') return;

    let lastWrite = 0;
    const touchActivity = () => {
      const now = Date.now();
      // Throttle localStorage writes during high-frequency events.
      if (now - lastWrite < 1000) return;
      lastWrite = now;
      window.localStorage.setItem(SIS_LAST_ACTIVITY_KEY, String(now));
    };

    const checkIdleTimeout = () => {
      if (isSessionExpiredByInactivity()) {
        handleLogout('idle');
        return true;
      }
      return false;
    };

    if (checkIdleTimeout()) return;

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((evt) => window.addEventListener(evt, touchActivity, { passive: true }));
    window.addEventListener('focus', touchActivity);
    const onVisibilityChange = () => {
      if (document.hidden) return;
      if (window.__sisPendingUnauthorized) {
        window.__sisPendingUnauthorized = false;
        handleLogout('expired');
        return;
      }
      if (!checkIdleTimeout()) {
        touchActivity();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const intervalId = window.setInterval(checkIdleTimeout, 60 * 1000);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, touchActivity));
      window.removeEventListener('focus', touchActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [isLoggedIn, handleLogout]);

  const menuItems = useMemo(
    () => ({
      student: [
        { id: 'dashboard', ...SIS_NAV.dashboard },
        { id: 'curriculum', ...SIS_NAV.curriculum },
        { id: 'moodle', ...SIS_NAV.moodle },
      ],
      admin: [
        { id: 'dashboard', ...SIS_NAV.dashboard },
        { id: 'curriculum', ...SIS_NAV.curriculum },
        { id: 'moodle', ...SIS_NAV.moodle },
      ],
    }),
    []
  );
  const activeMenuLabel =
    menuItems[userRole]?.find((item) => item.id === activeTab)?.label ||
    activeTab.replace('-', ' ');

  const renderContent = () => {
    if (userRole === 'student') {
      switch (activeTab) {
        case 'dashboard':
          return (
            <StudentDashboard
              moodleUserId={currentUser?.moodle_user_id}
              studentName={currentUser?.name}
            />
          );
        case 'curriculum':
          return (
            <StudentCurriculumExplorer
              moodleUserId={currentUser?.moodle_user_id}
              studentName={currentUser?.name}
            />
          );
        case 'moodle':
          return <AdminMoodleSync lockedMoodleUserId={currentUser?.moodle_user_id} />;
        default:
          return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <AlertCircle size={48} className="mb-4" />
              <p>Module "{activeTab}" is unavailable for student role.</p>
            </div>
          );
      }
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard role={userRole} lmsName={lmsName} />;
      case 'registration':
        return <StudentRegistration courses={courses} />;
      case 'roster':
        return <FacultyRoster students={students} />;
      case 'curriculum':
        return (
          <CurriculumModule />
        );
      case 'moodle':
        return <AdminMoodleSync />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <AlertCircle size={48} className="mb-4" />
            <p>Module "{activeTab}" is currently under development.</p>
          </div>
        );
    }
  };

  if (!isLoggedIn) {
    return (
      <Routes>
        <Route path="/" element={<LandingLogin onLogin={handleLogin} />} />
        <Route path="/login" element={<LandingLogin onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (pathname === '' || pathname === 'login') {
    return <Navigate to={`/${SIS_NAV.dashboard.path}`} replace />;
  }

  const legacyRedirect = LEGACY_ROUTE_REDIRECT[pathname];
  if (legacyRedirect) {
    return <Navigate to={legacyRedirect} replace />;
  }

  const knownPaths = new Set(Object.values(SIS_NAV).map((nav) => nav.path));
  if (!knownPaths.has(pathname)) {
    return <Navigate to={`/${SIS_NAV.dashboard.path}`} replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex text-slate-900 font-sans">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 bg-indigo-950 text-white shrink-0">
        <AppSidebarPanel
          menuItems={menuItems}
          userRole={userRole}
          currentUser={currentUser}
          setUserRole={setUserRole}
          handleLogout={handleLogout}
        />
      </div>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={closeSidebar}
          />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw] bg-indigo-950 text-white flex flex-col shadow-xl">
            <div className="flex justify-end p-2 border-b border-indigo-900">
              <button
                type="button"
                onClick={closeSidebar}
                className="p-2 text-indigo-300 hover:text-white rounded-lg hover:bg-indigo-900"
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>
            <AppSidebarPanel
              menuItems={menuItems}
              userRole={userRole}
              currentUser={currentUser}
              setUserRole={setUserRole}
              handleLogout={handleLogout}
              onNavigate={closeSidebar}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="h-14 sm:h-16 bg-white border-b flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 gap-3">
          <div className="flex items-center text-gray-400 space-x-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg shrink-0"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <span className="capitalize text-[10px] font-black tracking-widest bg-gray-100 px-2 py-1 rounded text-gray-500 shrink-0">{userRole}</span>
            <span className="text-gray-300 hidden sm:inline">/</span>
            <span className="text-gray-900 font-semibold truncate">{activeMenuLabel}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <UserCircle size={16} />
            </div>
            <div className="flex flex-col items-end leading-tight min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate max-w-[120px] sm:max-w-none">{currentUser?.name || 'User'}</p>
              <p className="text-xs text-gray-500 hidden md:block truncate max-w-[180px]">{currentUser?.email || 'No email available'}</p>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-8 overflow-y-auto flex-1 min-h-0">
          {globalNotice && (
            <div className="mb-4">
              <InlineStateMessage type={globalNotice.type}>
                <div className="flex items-center justify-between gap-3">
                  <span>{globalNotice.message}</span>
                  <button
                    type="button"
                    onClick={() => setGlobalNotice(null)}
                    className="text-xs font-semibold opacity-80 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
              </InlineStateMessage>
            </div>
          )}
          {renderContent()}
        </main>
      </div>

    </div>
  );
};

// --- SUB-COMPONENTS ---

const Dashboard = ({ role, lmsName }) => {
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(role === 'admin');
  const [error, setError] = useState(null);
  const [gradeLevels, setGradeLevels] = useState(null);
  const [totalCourses, setTotalCourses] = useState(null);
  const [totalMoodleStudents, setTotalMoodleStudents] = useState(null);
  const [moodleOk, setMoodleOk] = useState(null);
  const [studentsByGrade, setStudentsByGrade] = useState({});
  const [chartReady, setChartReady] = useState(false);
  const [lastGradeFetch, setLastGradeFetch] = useState(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('sis_last_grade_fetch');
  });

  const metricSetters = React.useMemo(
    () => ({
      setGradeLevels,
      setTotalCourses,
      setTotalMoodleStudents,
      setStudentsByGrade,
      setMoodleOk,
      setChartReady,
    }),
    []
  );

  useEffect(() => {
    if (role !== 'admin') return;

    let cancelled = false;
    const cached = readOverviewCache();
    if (cached) {
      applyOverviewMetrics(cached, metricSetters);
      setLoading(false);
      setStatsLoading(!isOverviewCacheFull(cached));
      if (isOverviewCacheFull(cached)) {
        setChartReady(true);
      }
    } else {
      setLoading(true);
      setStatsLoading(true);
    }
    setError(null);

    const applyFull = (full) => {
      if (cancelled || !full) return;
      applyOverviewMetrics(full, metricSetters);
      writeOverviewCache(full);
      setStatsLoading(false);
      setLoading(false);
    };

    if (isOverviewCacheFull(cached)) {
      return () => {
        cancelled = true;
      };
    }

    if (cached && cached.partial === true) {
      prefetchOverviewMetrics()
        .then(applyFull)
        .catch(() => {
          if (cancelled) return;
          setMoodleOk(false);
          setError(MSG.LOAD_DASHBOARD);
          setLoading(false);
          setStatsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    prefetchOverviewMetrics()
      .then((full) => {
        if (cancelled) return;
        const partial = readOverviewCache();
        if (partial && partial.partial === true) {
          applyOverviewMetrics(partial, metricSetters);
        }
        applyFull(full);
      })
      .catch(() => {
        if (cancelled) return;
        setMoodleOk(false);
        setError(MSG.LOAD_DASHBOARD);
        setLoading(false);
        setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [role, metricSetters]);

  // Non-admin roles keep a simple static dashboard for now.
  if (role !== 'admin') {
    const stats = {
      student: [
        { label: 'Attendance', value: '94%', icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Classes Completed', value: '8', icon: BookOpen, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Fees Due', value: '1,200 ETB', icon: CreditCard, color: 'text-red-600', bg: 'bg-red-50' },
      ],
      faculty: [
        { label: 'Active Classes', value: '4', icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Total Students', value: '128', icon: Users, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Pending Grades', value: '12', icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50' },
      ],
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats[role].map((s, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${s.bg}`}>
                  <s.icon className={s.color} size={24} />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium">{s.label}</h3>
              <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const formattedLastFetch =
    lastGradeFetch && !Number.isNaN(Date.parse(lastGradeFetch))
      ? new Date(lastGradeFetch).toLocaleString()
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500">At-a-glance overview for administrators.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {(loading || statsLoading) && (
          <span className="text-xs font-medium text-gray-400">
            {loading ? 'Loading dashboard…' : 'Loading student counts…'}
          </span>
        )}
        <button
          type="button"
          disabled={loading || statsLoading}
          onClick={async () => {
            setStatsLoading(true);
            setError(null);
            setChartReady(false);
            clearOverviewCache();
            try {
              const metrics = await fetchOverviewMetrics(
                '/api/moodle/overview-metrics?refresh=1&include_students=1'
              );
              applyOverviewMetrics(metrics, metricSetters);
              writeOverviewCache(metrics);
            } catch {
              setMoodleOk(false);
              setError(MSG.LOAD_DASHBOARD_REFRESH);
            } finally {
              setStatsLoading(false);
              setLoading(false);
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg border border-gray-200 disabled:opacity-50"
          title="Fetch latest counts (ignores cache)"
        >
          <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
        </div>
      </div>

      {error && <InlineStateMessage type="error">{error}</InlineStateMessage>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 dashboard-stat-enter"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-indigo-50">
              <GraduationCap className="text-indigo-600" size={24} />
            </div>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Total grade levels</h3>
          <AnimatedStatNumber
            value={gradeLevels}
            className="text-2xl font-bold text-gray-900 mt-1 tabular-nums"
            duration={850}
            delay={80}
          />
        </div>

        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 dashboard-stat-enter"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-blue-50">
              <BookOpen className="text-blue-600" size={24} />
            </div>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Total courses</h3>
          <AnimatedStatNumber
            value={totalCourses}
            className="text-2xl font-bold text-gray-900 mt-1 tabular-nums"
            duration={850}
            delay={160}
          />
          <p className="text-[11px] text-gray-400 mt-1">Across all grade levels.</p>
        </div>

        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 dashboard-stat-enter"
          style={{ animationDelay: '160ms' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-emerald-50">
              <Users className="text-emerald-600" size={24} />
            </div>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Enrolled students</h3>
          {statsLoading && totalMoodleStudents == null ? (
            <div className="mt-1 h-8 w-16 rounded-lg bg-gray-100 animate-pulse" aria-label="Loading student count" />
          ) : (
            <AnimatedStatNumber
              value={totalMoodleStudents}
              className="text-2xl font-bold text-gray-900 mt-1 tabular-nums"
              duration={900}
              delay={240}
            />
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            Unique students enrolled across all courses.
          </p>
        </div>

        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 dashboard-stat-enter"
          style={{ animationDelay: '240ms' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-amber-50">
              <FileText className="text-amber-600" size={24} />
            </div>
          </div>
          <h3 className="text-gray-500 text-sm font-medium">Last grade fetch</h3>
          <p className="text-sm font-semibold text-gray-900 mt-1">
            {formattedLastFetch || 'No grade fetch recorded yet'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Recorded when grades are fetched in Grade Reports.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2 w-2 rounded-full ${
                moodleOk === null ? 'bg-gray-300' : moodleOk ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <h3 className="text-sm font-semibold text-gray-900">Connection to {lmsName}</h3>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          {moodleOk === null && connectionCheckingMessage(lmsName)}
          {moodleOk === true && connectionOkMessage(lmsName)}
          {moodleOk === false && connectionUnavailableMessage(lmsName)}
        </p>
      </div>

      {Object.keys(studentsByGrade).length > 0 && (
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 dashboard-stat-enter"
          style={{ animationDelay: '320ms' }}
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Students per grade level</h3>
          <StudentsPerGradeChart studentsByGrade={studentsByGrade} />
        </div>
      )}    </div>
  );
};

const AdmissionsModule = ({ students, loading, onOpenModal, onViewRecord, onDeleteStudent }) => {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const pagedStudents = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return students.slice(start, start + pageSize);
  }, [students, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Student Admissions</h3>
          <p className="text-sm text-gray-500">System registry for K-12 and Language School enrollment</p>
        </div>
        <button 
          onClick={onOpenModal}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all flex items-center justify-center shadow-lg shadow-indigo-200 w-full sm:w-auto"
        >
          <UserPlus size={18} className="mr-2" />
          Admit Student
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[640px]">
          <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-widest border-b">
            <tr>
              <th className="px-6 py-4">Student ID</th>
              <th className="px-6 py-4">Full Name</th>
              <th className="px-6 py-4">Grade / Level</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y text-sm">
            {loading ? (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-400">Loading…</td>
              </tr>
            ) : students.length > 0 ? (
              pagedStudents.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600">{student.sis_id || student.id}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-bold text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-600">{student.grade_level || student.level || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${
                      (student.status || 'Active') === 'Active' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {student.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={() => onViewRecord(student)}
                      className="text-indigo-600 hover:text-white font-bold text-xs px-3 py-1.5 hover:bg-indigo-600 border border-indigo-100 rounded-lg transition-all"
                    >
                      View Record
                    </button>
                    <button 
                      onClick={() => onDeleteStudent(student.id)}
                      className="text-gray-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete Student"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="px-6 py-12 text-center text-gray-400 italic">No student records found.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      {!loading && students.length > pageSize && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-gray-500">
            Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, students.length)} of {students.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const StudentProfileModal = ({ student, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-indigo-950/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b flex justify-between items-center bg-indigo-900 text-white">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-700 border-2 border-indigo-500/30 flex items-center justify-center font-bold text-2xl">
              {student.name.charAt(0)}
            </div>
            <div>
              <h4 className="text-xl font-bold">{student.name}</h4>
              <p className="text-xs text-indigo-300 font-mono tracking-wider">{student.sis_id || student.id} • {student.level || student.grade_level}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 bg-white">
          {/* Identity Section */}
          <div className="space-y-6">
            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 border-b pb-2">Personal Information</h5>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gray-50 rounded-lg"><Calendar size={16} className="text-gray-400" /></div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Age</p>
                  <p className="text-sm font-semibold text-gray-900">{student.age || 'N/A'} Years</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gray-50 rounded-lg"><User size={16} className="text-gray-400" /></div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Gender</p>
                  <p className="text-sm font-semibold text-gray-900">{student.gender || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gray-50 rounded-lg"><Phone size={16} className="text-gray-400" /></div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Phone Number</p>
                <p className="text-sm font-semibold text-gray-900">{student.phone || 'Not Provided'}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gray-50 rounded-lg"><MapPin size={16} className="text-gray-400" /></div>
              <div>
                <p className="text-[10px] text-gray-400 font-bold uppercase">Residential Location</p>
                <p className="text-sm font-semibold text-gray-900">{student.location || 'Unknown'}</p>
              </div>
            </div>
          </div>

          {/* Academic/Financial Section */}
          <div className="space-y-6">
            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 border-b pb-2">Academic Standing</h5>
            
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Status</p>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                student.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {student.status}
              </span>
            </div>

            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Financial Balance</p>
              <p className={`text-xl font-black ${student.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {student.balance.toLocaleString()} <span className="text-sm font-normal text-gray-400">ETB</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1 italic">Last payment sync: Today</p>
            </div>

            <div className="bg-indigo-50 rounded-2xl p-4 flex items-start space-x-3 border border-indigo-100/50">
              <Info size={18} className="text-indigo-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-indigo-700/70 leading-relaxed font-medium">
                Profile changes to level or status are saved and reflected in your learning portal shortly.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t flex justify-end items-center space-x-4">
          <button 
            className="text-indigo-600 text-sm font-bold hover:bg-indigo-100 px-4 py-2 rounded-xl transition-colors"
          >
            Edit Profile
          </button>
          <button 
            onClick={onClose}
            className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            Close Record
          </button>
        </div>
      </div>
    </div>
  );
};

const CurriculumModule = () => {
  const [loadingCats, setLoadingCats] = useState(false);
  const [catError, setCatError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseError, setCourseError] = useState(null);
  const [moodleCourses, setMoodleCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState(null);
  const [courseStudents, setCourseStudents] = useState([]);
  const [studentsFetchedAt, setStudentsFetchedAt] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState({});
  const [detailCourse, setDetailCourse] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [studentSearch, setStudentSearch] = useState('');
  const [sortDir, setSortDir] = useState('desc');
  const [studentsPage, setStudentsPage] = useState(1);
  const deferredStudentSearch = React.useDeferredValue(studentSearch);

  useEffect(() => {
    let alive = true;
    setLoadingCats(true);
    setCatError(null);
    apiFetch('/api/moodle/categories')
      .then((res) => res.ok ? res.json() : Promise.reject(res))
      .then((data) => {
        if (!alive) return;
        const cats = Array.isArray(data.categories) ? data.categories : [];
        setCategories(sortGradeLevelCategories(cats));
      })
      .catch((res) =>
        alive &&
        setCatError(
          res?.status ? messageForHttpStatus(res.status) : MSG.LOAD_CATEGORIES
        )
      )
      .finally(() => alive && setLoadingCats(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) {
      setMoodleCourses([]);
      setSelectedCourse(null);
      setCourseStudents([]);
      return;
    }
    let alive = true;
    setLoadingCourses(true);
    setCourseError(null);
    setSelectedCourse(null);
    setCourseStudents([]);
    apiFetch(`/api/moodle/courses/${selectedCategoryId}`)
      .then((res) => res.ok ? res.json() : Promise.reject(res))
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data.courses) ? data.courses : [];
        setMoodleCourses(list);
      })
      .catch((res) =>
        alive &&
        setCourseError(
          res?.status ? messageForHttpStatus(res.status) : MSG.LOAD_COURSES_GRADE
        )
      )
      .finally(() => alive && setLoadingCourses(false));
    return () => { alive = false; };
  }, [selectedCategoryId]);

  const loadCourseStudents = async (course, opts = {}) => {
    setSelectedCourse(course);
    setLoadingStudents(true);
    setStudentError(null);
    setCourseStudents([]);
    setStudentsFetchedAt(null);
    setCompareSelected({});
    setDetailCourse(null);
    setDetailItems([]);
    setDetailError(null);
    try {
      const refresh = !!opts.refresh;
      const url = refresh
        ? `/api/moodle/course-students/${course.id}?refresh=1`
        : `/api/moodle/course-students/${course.id}`;
      const res = await apiFetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStudentError(
          res.status ? messageForHttpStatus(res.status) : MSG.LOAD_COURSE_STUDENTS
        );
        return;
      }
      setCourseStudents(Array.isArray(data.students) ? data.students : []);
      setStudentsFetchedAt(data.fetched_at || null);
    } catch {
      setStudentError(MSG.LOAD_COURSE_STUDENTS);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleViewStudentGrades = (studentRow) => {
    if (!selectedCourse?.id) return;
    if (!studentRow?.moodle_user_id) return;

    const courseForModal = {
      course_id: selectedCourse.id,
      course_name: selectedCourse.fullname || selectedCourse.shortname || `Course ${selectedCourse.id}`,
      student_name: studentRow.fullname || studentRow.email || `Student ${studentRow.moodle_user_id}`,
    };

    setDetailCourse(courseForModal);
    setDetailItems([]);
    setDetailError(null);
    setDetailLoading(true);

    apiFetch(`/api/moodle/course-grades-direct/${studentRow.moodle_user_id}/${selectedCourse.id}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setDetailItems(data.items || []);
        else
          setDetailError(MSG.LOAD_DETAILED_GRADES);
      })
      .catch((res) =>
        setDetailError(
          res?.status ? messageForHttpStatus(res.status) : MSG.LOAD_DETAILED_GRADES
        )
      )
      .finally(() => setDetailLoading(false));
  };

  const toggleCompare = () => setCompareMode((v) => !v);

  const toggleStudentSelect = (moodleUserId) => {
    setCompareSelected((prev) => ({
      ...prev,
      [moodleUserId]: !prev[moodleUserId],
    }));
  };

  const selectedForCompare = React.useMemo(
    () => courseStudents.filter((s) => compareSelected[s.moodle_user_id]),
    [courseStudents, compareSelected]
  );
  const leaderboard = React.useMemo(() => {
    return [...selectedForCompare].sort((a, b) => {
      const pa = a.course_total_percentage;
      const pb = b.course_total_percentage;
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return pb - pa;
    });
  }, [selectedForCompare]);

  const filteredStudents = React.useMemo(() => {
    const query = deferredStudentSearch.trim().toLowerCase();
    if (!query) return courseStudents;
    return courseStudents.filter((s) =>
      (s.fullname || '').toLowerCase().includes(query) ||
      (s.email || '').toLowerCase().includes(query)
    );
  }, [courseStudents, deferredStudentSearch]);

  const sortedStudents = React.useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      const pa = a.course_total_percentage;
      const pb = b.course_total_percentage;
      if (pa == null && pb == null) return 0;
      if (pa == null) return sortDir === 'desc' ? 1 : -1;
      if (pb == null) return sortDir === 'desc' ? -1 : 1;
      return sortDir === 'desc' ? pb - pa : pa - pb;
    });
  }, [filteredStudents, sortDir]);
  const studentsPageSize = 25;
  const studentsTotalPages = React.useMemo(
    () => Math.max(1, Math.ceil(sortedStudents.length / studentsPageSize)),
    [sortedStudents.length]
  );
  const pagedSortedStudents = React.useMemo(() => {
    const start = (studentsPage - 1) * studentsPageSize;
    return sortedStudents.slice(start, start + studentsPageSize);
  }, [sortedStudents, studentsPage]);

  useEffect(() => {
    setStudentsPage(1);
  }, [selectedCourse?.id, deferredStudentSearch, sortDir]);

  useEffect(() => {
    if (studentsPage > studentsTotalPages) setStudentsPage(studentsTotalPages);
  }, [studentsPage, studentsTotalPages]);

  const nonNullStudents = React.useMemo(
    () => courseStudents.filter((s) => s.course_total_percentage != null),
    [courseStudents]
  );
  const studentCount = courseStudents.length;
  const avgPct = React.useMemo(() => {
    if (nonNullStudents.length === 0) return null;
    return nonNullStudents.reduce((sum, s) => sum + (s.course_total_percentage || 0), 0) / nonNullStudents.length;
  }, [nonNullStudents]);
  const minPct = React.useMemo(() => {
    if (nonNullStudents.length === 0) return null;
    return nonNullStudents.reduce(
      (min, s) =>
        s.course_total_percentage != null && s.course_total_percentage < min
          ? s.course_total_percentage
          : min,
      nonNullStudents[0].course_total_percentage
    );
  }, [nonNullStudents]);
  const maxPct = React.useMemo(() => {
    if (nonNullStudents.length === 0) return null;
    return nonNullStudents.reduce(
      (max, s) =>
        s.course_total_percentage != null && s.course_total_percentage > max
          ? s.course_total_percentage
          : max,
      nonNullStudents[0].course_total_percentage
    );
  }, [nonNullStudents]);

  const bucketsConfig = [
    { id: '0-50', label: '0–50', min: 0, max: 50 },
    { id: '50-60', label: '50–60', min: 50, max: 60 },
    { id: '60-70', label: '60–70', min: 60, max: 70 },
    { id: '70-80', label: '70–80', min: 70, max: 80 },
    { id: '80-90', label: '80–90', min: 80, max: 90 },
    { id: '90-100', label: '90–100', min: 90, max: 101 },
  ];

  const bucketCounts = React.useMemo(() => {
    return bucketsConfig.map((bucket) => {
      const count = nonNullStudents.filter((s) => {
        const p = s.course_total_percentage;
        return p != null && p >= bucket.min && p < bucket.max;
      }).length;
      return { ...bucket, count };
    });
  }, [nonNullStudents]);

  const maxBucketCount = React.useMemo(
    () => bucketCounts.reduce((m, b) => (b.count > m ? b.count : m), 0) || 1,
    [bucketCounts]
  );

  const globalLeaderboard = React.useMemo(
    () => [...nonNullStudents].sort((a, b) => b.course_total_percentage - a.course_total_percentage),
    [nonNullStudents]
  );
  const top3 = React.useMemo(() => globalLeaderboard.slice(0, 3), [globalLeaderboard]);
  const lowest3 = React.useMemo(() => [...globalLeaderboard].slice(-3).reverse(), [globalLeaderboard]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{SIS_NAV.curriculum.label}</h3>
          <p className="text-sm text-gray-500">Grade level → course → students and grades</p>
        </div>
        <button
          onClick={toggleCompare}
          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all w-full sm:w-auto ${
            compareMode ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
          }`}
        >
          {compareMode ? 'Compare: ON' : 'Compare students'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-gray-800">1) Select Grade/Level</h4>
            {loadingCats && <span className="text-xs text-gray-400">Loading…</span>}
          </div>
          {catError ? (
            <InlineStateMessage type="error">{catError}</InlineStateMessage>
          ) : (
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm"
            >
              <option value="">— Select —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-gray-800">2) Select Course</h4>
            {loadingCourses && <span className="text-xs text-gray-400">Loading…</span>}
          </div>
          {!selectedCategoryId ? (
            <InlineStateMessage>{MSG.VALIDATION_PICK_GRADE}</InlineStateMessage>
          ) : courseError ? (
            <InlineStateMessage type="error">{courseError}</InlineStateMessage>
          ) : moodleCourses.length === 0 ? (
            <InlineStateMessage>No courses found in this category.</InlineStateMessage>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {moodleCourses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadCourseStudents(c)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    selectedCourse?.id === c.id
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-bold text-gray-900">{c.fullname || c.shortname || `Course ${c.id}`}</div>
                  <div className="text-xs text-gray-500">Course ID: {c.id}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-bold text-gray-800">
                3) Students &amp; Grades {selectedCourse ? `• ${selectedCourse.fullname || selectedCourse.shortname || `Course ${selectedCourse.id}`}` : ''}
              </h4>
              {selectedCourse && (
                <p className="text-xs text-gray-500 mt-1">
                  Students: {studentCount}{' '}
                  {avgPct != null && `• Course average: ${avgPct.toFixed(1)}%`}{' '}
                  {maxPct != null && `• Highest: ${maxPct.toFixed(1)}%`}{' '}
                  {minPct != null && `• Lowest: ${minPct.toFixed(1)}%`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {selectedCourse && (
                <div className="relative">
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search name or email..."
                    className="pl-3 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 focus:bg-white"
                  />
                </div>
              )}
              {selectedCourse && (
                <button
                  type="button"
                  onClick={() => loadCourseStudents(selectedCourse, { refresh: true })}
                  disabled={loadingStudents}
                  className="px-2 py-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg border border-gray-200 disabled:opacity-50 disabled:pointer-events-none"
                  title="Refresh grades"
                >
                  Refresh
                </button>
              )}
              {loadingStudents && <span className="text-xs text-gray-400">Loading…</span>}
              {courseStudents.length > 0 && selectedCourse && (
                <button
                  type="button"
                  onClick={() => {
                    const courseName = selectedCourse.fullname || selectedCourse.shortname || `course-${selectedCourse.id}`;
                    const rows = courseStudents.map((s) => ({
                      Name: s.fullname ?? '',
                      Email: s.email ?? '',
                      'Course Total %': s.course_total_percentage != null ? s.course_total_percentage : '',
                    }));
                    const safeName = courseName.replace(/[^\w\s-]/g, '');
                    downloadCsv(`course-${selectedCourse.id}-grades.csv`, rows);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg border border-indigo-200"
                >
                  <Download size={14} />
                  Export CSV
                </button>
              )}
            </div>
          </div>
          {!selectedCourse ? (
            <InlineStateMessage>{MSG.VALIDATION_SELECT_COURSE}</InlineStateMessage>
          ) : studentError ? (
            <InlineStateMessage type="error">{studentError}</InlineStateMessage>
          ) : courseStudents.length === 0 ? (
            <InlineStateMessage>{MSG.EMPTY_NO_STUDENTS_COURSE}</InlineStateMessage>
          ) : (
            <div className="space-y-3">
              <div className="hidden sm:flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b pb-2">
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <span className="w-6 text-center shrink-0">#</span>
                  <span className="flex-1">Student Name</span>
                  <span className="w-40 hidden md:inline">Email</span>
                </div>
                <div className="flex items-center gap-4 pr-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                    className="flex items-center gap-1 text-gray-500 hover:text-indigo-600"
                  >
                    <span>Course Total %</span>
                    <span>{sortDir === 'desc' ? '↓' : '↑'}</span>
                  </button>
                  <span className="w-16 text-right">Action</span>
                </div>
              </div>
              <div className="space-y-1 max-h-[45vh] overflow-y-auto pr-1">
                {pagedSortedStudents.map((s, idx) => (
                  <div
                    key={`${s.moodle_user_id}-${idx}`}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded-lg px-2"
                  >
                    <div className="flex-1 flex items-center gap-3 min-w-0">
                      <span className="w-6 text-center text-xs font-mono text-gray-400 shrink-0">
                        {(studentsPage - 1) * studentsPageSize + idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {s.fullname}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {s.email || MSG.STUDENT_ACCOUNT_FALLBACK}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      {compareMode && (
                        <input
                          type="checkbox"
                          checked={!!compareSelected[s.moodle_user_id]}
                          onChange={() => toggleStudentSelect(s.moodle_user_id)}
                          className="h-4 w-4 accent-indigo-600"
                          title="Select for comparison"
                        />
                      )}
                      <div className="text-sm font-bold text-gray-800 w-16 text-right">
                        {s.course_total_percentage != null ? `${s.course_total_percentage}%` : '—'}
                      </div>
                      <button
                        onClick={() => handleViewStudentGrades(s)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
                        title="View detailed grades"
                      >
                        View grades
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {sortedStudents.length > studentsPageSize && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-gray-500">
                    Showing {(studentsPage - 1) * studentsPageSize + 1} - {Math.min(studentsPage * studentsPageSize, sortedStudents.length)} of {sortedStudents.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStudentsPage((p) => Math.max(1, p - 1))}
                      disabled={studentsPage === 1}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-gray-500">Page {studentsPage} / {studentsTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setStudentsPage((p) => Math.min(studentsTotalPages, p + 1))}
                      disabled={studentsPage === studentsTotalPages}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">
            This list shows students enrolled in this course.
            {studentsFetchedAt ? ` Last updated: ${new Date(studentsFetchedAt).toLocaleString()}.` : ''}
          </p>
        </div>
      </div>

      {selectedCourse && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest">Students</p>
              <p className="text-2xl font-bold text-indigo-900 mt-1">{studentCount}</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest">Course average</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {avgPct != null ? `${avgPct.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-widest">Highest grade</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">
                {maxPct != null ? `${maxPct.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
              <p className="text-xs font-semibold text-rose-500 uppercase tracking-widest">Lowest grade</p>
              <p className="text-2xl font-bold text-rose-900 mt-1">
                {minPct != null ? `${minPct.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                Grade distribution
              </h5>
              <div className="space-y-2">
                {bucketCounts.map((bucket) => {
                  const width =
                    maxBucketCount > 0 ? Math.max(4, (bucket.count / maxBucketCount) * 100) : 0;
                  return (
                    <div key={bucket.id} className="flex items-center gap-3 text-xs">
                      <div className="w-16 text-gray-500">{bucket.label}</div>
                      <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-3 rounded-full bg-indigo-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <div className="w-6 text-right text-gray-700 font-semibold">
                        {bucket.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Top 3 students
                </h5>
                {top3.length === 0 ? (
                  <p className="text-xs text-gray-500">No graded students yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {top3.map((s, idx) => (
                      <li
                        key={s.moodle_user_id || idx}
                        className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2"
                      >
                        <span className="truncate mr-2">{s.fullname}</span>
                        <span className="font-bold text-emerald-700">
                          {s.course_total_percentage != null
                            ? `${s.course_total_percentage}%`
                            : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Needs attention (lowest 3)
                </h5>
                {lowest3.length === 0 ? (
                  <p className="text-xs text-gray-500">No graded students yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {lowest3.map((s, idx) => (
                      <li
                        key={s.moodle_user_id || idx}
                        className="flex items-center justify-between text-xs bg-rose-50 border border-rose-100 rounded-xl px-3 py-2"
                      >
                        <span className="truncate mr-2">{s.fullname}</span>
                        <span className="font-bold text-rose-700">
                          {s.course_total_percentage != null
                            ? `${s.course_total_percentage}%`
                            : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {compareMode && (
            <div className="mt-8 border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Comparison (selected only)</h4>
                  <p className="text-xs text-gray-500">
                    {selectedCourse.fullname || selectedCourse.shortname || `Course ${selectedCourse.id}`}{' '}
                    • selected {selectedForCompare.length}
                  </p>
                </div>
              </div>

              {selectedForCompare.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Select some students using the checkboxes in the list above.
                </p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                      Leaderboard (by %)
                    </h5>
                    <div className="divide-y border rounded-2xl overflow-hidden">
                      {leaderboard.map((s, i) => (
                        <div
                          key={s.moodle_user_id}
                          className="flex items-center justify-between px-4 py-3 bg-white"
                        >
                          <div className="min-w-0 pr-4">
                            <div className="text-sm font-bold text-gray-900 truncate">
                              {i + 1}. {s.fullname}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {s.email || MSG.STUDENT_ACCOUNT_FALLBACK}
                            </div>
                          </div>
                          <div className="text-sm font-extrabold text-indigo-700">
                            {s.course_total_percentage != null
                              ? `${s.course_total_percentage}%`
                              : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                      Milestone Progress
                    </h5>
                    <div className="space-y-4">
                      {leaderboard.map((s) => {
                        const pct = s.course_total_percentage ?? 0;
                        const clamped = Math.max(0, Math.min(100, pct));
                        return (
                          <div key={s.moodle_user_id} className="border rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-bold text-gray-900 truncate pr-4">
                                {s.fullname}
                              </div>
                              <div className="text-sm font-extrabold text-gray-800">
                                {pct != null ? `${pct}%` : '—'}
                              </div>
                            </div>
                            <div className="relative h-4 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="absolute left-0 top-0 h-4 bg-indigo-600/20"
                                style={{ width: `${clamped}%` }}
                              />
                              <div
                                className="absolute top-1/2 -translate-y-1/2"
                                style={{ left: `calc(${clamped}% - 10px)` }}
                                title="Progress"
                              >
                                <div className="w-5 h-3 rounded-sm bg-indigo-600 shadow" />
                              </div>
                            </div>
                            <div className="mt-2 flex justify-between text-[10px] text-gray-400 font-semibold">
                              <span>Start</span>
                              <span>Milestone</span>
                              <span>Finish</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {detailCourse && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-indigo-900 text-white">
              <div>
                <h4 className="text-sm font-bold">
                  Detailed grades • {detailCourse.course_name}
                </h4>
                {detailCourse.student_name && (
                  <p className="text-indigo-200 text-xs mt-1">Student: {detailCourse.student_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {detailItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const studentName = detailCourse.student_name ?? '';
                      const rows = detailItems.map((item) => ({
                        'Student': studentName,
                        'Grade item': item.item_name ?? '',
                        'Weight': item.weight ?? '',
                        'Grade': item.grade_text ?? '',
                        'Range': item.range ?? '',
                        'Percentage': item.percentage ?? '',
                        'Contribution': item.contribution_to_total ?? '',
                      }));
                      const courseSafe = (detailCourse.course_name || 'course').replace(/[^\w\s-]/g, '');
                      const studentSafe = studentName.replace(/[^\w\s-]/g, '') || 'student';
                      const date = new Date().toISOString().slice(0, 10);
                      downloadCsv(`${studentSafe}-grades-detail-${courseSafe}-${date}.csv`, rows);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                )}
                <button
                  onClick={() => {
                    setDetailCourse(null);
                    setDetailItems([]);
                    setDetailError(null);
                  }}
                  className="px-2 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {detailLoading ? (
                <InlineStateMessage>Loading detailed grades...</InlineStateMessage>
              ) : detailError ? (
                <InlineStateMessage type="error">{detailError}</InlineStateMessage>
              ) : detailItems.length === 0 ? (
                <InlineStateMessage>No detailed items found for this course.</InlineStateMessage>
              ) : (
                <div className="text-xs md:text-sm">
                  <div className="grid grid-cols-3 md:grid-cols-7 gap-2 px-2 py-2 border-b text-[10px] md:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="col-span-2 md:col-span-2">Grade item</div>
                    <div className="hidden md:block">Weight</div>
                    <div>Grade</div>
                    <div className="hidden md:block">Range</div>
                    <div className="hidden md:block">Percentage</div>
                    <div className="hidden md:block text-right">Contribution</div>
                  </div>
                  <ul className="divide-y">
                    {detailItems.map((item) => (
                      <li
                        key={`${item.item_name || ''}-${item.weight || ''}-${item.range || ''}-${item.grade_text || ''}`}
                        className="py-2 px-2 grid grid-cols-3 md:grid-cols-7 gap-2 items-center"
                      >
                        <div className="col-span-2 md:col-span-2 font-medium text-gray-800">
                          {item.item_name}
                        </div>
                        <div className="hidden md:block text-gray-600">
                          {item.weight || '—'}
                        </div>
                        <div className="text-gray-800">
                          {item.grade_text || '—'}
                        </div>
                        <div className="hidden md:block text-gray-600">
                          {item.range || '—'}
                        </div>
                        <div className="hidden md:block text-gray-600">
                          {item.percentage || '—'}
                        </div>
                        <div className="hidden md:block text-right text-gray-800">
                          {item.contribution_to_total || '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CourseFormModal = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    level: 'Grade 1',
    faculty: ''
  });

  const gradeLevels = [
    "Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", 
    "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", 
    "Grade 12", "Beginner", "Intermediate", "Advanced"
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.id || !formData.name) return;
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b flex justify-between items-center bg-indigo-900 text-white">
          <h4 className="text-lg font-bold">Add Curriculum Module</h4>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Module Code</label>
              <input 
                required
                type="text" 
                placeholder="e.g. MATH-G5"
                value={formData.id}
                onChange={(e) => setFormData({...formData, id: e.target.value.toUpperCase()})}
                className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Target Level</label>
              <select 
                value={formData.level}
                onChange={(e) => setFormData({...formData, level: e.target.value})}
                className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              >
                {gradeLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Module Title</label>
            <input 
              required
              type="text" 
              placeholder="e.g. Advanced Fractions"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Assigned Instructor</label>
            <input 
              required
              type="text" 
              placeholder="e.g. Dr. Almaz"
              value={formData.faculty}
              onChange={(e) => setFormData({...formData, faculty: e.target.value})}
              className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            />
          </div>
          <div className="pt-4">
            <button 
              type="submit"
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center shadow-lg shadow-indigo-100"
            >
              Add to Curriculum
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AdmissionFormModal = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    id: `STU${Math.floor(Math.random() * 900) + 100}`,
    name: '',
    email: '',
    level: 'Grade 1',
    age: '',
    gender: 'Male',
    phone: '',
    location: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    onSubmit(formData);
  };

  const gradeOptions = [
    { label: "Elementary (K-8)", options: ["Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"] },
    { label: "Secondary (9-12)", options: ["Grade 9", "Grade 10", "Grade 11", "Grade 12"] },
    { label: "Language Proficiency", options: ["Beginner", "Intermediate", "Advanced"] }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8">
        <div className="p-6 border-b flex justify-between items-center bg-indigo-900 text-white">
          <h4 className="text-lg font-bold text-white">Manual Admission Form</h4>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors text-white">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Full Name</label>
              <input 
                required
                type="text" 
                placeholder="Abebe Bekele"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email Address</label>
              <input 
                required
                type="email" 
                placeholder="student@edu.et"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all focus:bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Age</label>
              <input 
                type="number" 
                placeholder="Years"
                value={formData.age}
                onChange={(e) => setFormData({...formData, age: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gender</label>
              <select 
                value={formData.gender}
                onChange={(e) => setFormData({...formData, gender: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all focus:bg-white"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Phone Number</label>
            <input 
              type="tel" 
              placeholder="+251 9XX XXXXXX"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Location / Address</label>
            <input 
              type="text" 
              placeholder="e.g. Addis Ababa, Bole"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
              className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Grade / Level Assignment</label>
            <select 
              value={formData.level}
              onChange={(e) => setFormData({...formData, level: e.target.value})}
              className="w-full px-4 py-2.5 border border-gray-100 bg-gray-50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all focus:bg-white"
            >
              {gradeOptions.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center"
            >
              Confirm Admission
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const StudentRegistration = ({ courses }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b">
        <h3 className="text-lg font-bold">Available Class Modules</h3>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[560px]">
        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-widest">
          <tr>
            <th className="px-6 py-4 text-center">Module Code</th>
            <th className="px-6 py-4">Title</th>
            <th className="px-6 py-4 text-center">Level</th>
            <th className="px-6 py-4">Assigned Teacher</th>
            <th className="px-6 py-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y text-sm">
          {courses.map(course => (
            <tr key={course.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 font-mono font-bold text-indigo-600 text-center">{course.id}</td>
              <td className="px-6 py-4 font-bold text-gray-900">{course.name}</td>
              <td className="px-6 py-4 text-center font-medium text-gray-500">{course.level}</td>
              <td className="px-6 py-4 text-gray-600">{course.faculty}</td>
              <td className="px-6 py-4 text-right">
                <button className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors">
                  Enroll
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

const FacultyRoster = ({ students }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center bg-gray-50/50">
        <h3 className="text-lg font-bold">Class List: Grade 5 Mathematics</h3>
        <button className="text-indigo-600 flex items-center space-x-1 text-sm font-bold hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
          <LinkIcon size={14} />
          <span>Launch classroom</span>
        </button>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[560px]">
        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-widest">
          <tr>
            <th className="px-6 py-4">ID</th>
            <th className="px-6 py-4">Student Name</th>
            <th className="px-6 py-4">Level</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4 text-right">Manage</th>
          </tr>
        </thead>
        <tbody className="divide-y text-sm">
          {students.map(student => (
            <tr key={student.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 font-mono font-bold text-indigo-600">{student.id}</td>
              <td className="px-6 py-4 font-bold text-gray-900">{student.name}</td>
              <td className="px-6 py-4 font-medium">{student.level}</td>
              <td className="px-6 py-4">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${
                  student.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {student.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right space-x-3">
                <button className="text-indigo-600 text-xs font-bold hover:underline">Profile</button>
                <button className="text-indigo-600 text-xs font-bold hover:underline">Assess</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
};

const StudentDashboard = ({ moodleUserId, studentName }) => {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!moodleUserId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/api/moodle/site-students/${moodleUserId}/grades`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setGrades(data.grades || []);
      })
      .catch(() => {
        if (!cancelled) setError(MSG.LOAD_GRADE_OVERVIEW);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moodleUserId]);

  const percentages = grades
    .map((g) => Number(g.course_total_percentage))
    .filter((n) => !Number.isNaN(n));
  const avg = percentages.length ? percentages.reduce((a, b) => a + b, 0) / percentages.length : null;
  const best = percentages.length ? Math.max(...percentages) : null;
  const lowest = percentages.length ? Math.min(...percentages) : null;
  const coursesWithPct = grades
    .map((g) => {
      const pct = Number(g.course_total_percentage);
      if (Number.isNaN(pct)) return null;
      return {
        course: g.course_name || `Course ${g.course_id || ''}`,
        pct: Math.max(0, Math.min(100, pct)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);
  const topCourses = coursesWithPct.slice(0, 6);
  const bandBuckets = [
    { label: '90-100', min: 90, max: 100, inclusiveMax: true, color: 'bg-emerald-500' },
    { label: '80-89', min: 80, max: 90, color: 'bg-green-500' },
    { label: '70-79', min: 70, max: 80, color: 'bg-blue-500' },
    { label: '60-69', min: 60, max: 70, color: 'bg-amber-500' },
    { label: '0-59', min: 0, max: 60, color: 'bg-rose-500' },
  ].map((b) => ({
    ...b,
    count: percentages.filter((p) => p >= b.min && (b.inclusiveMax ? p <= b.max : p < b.max)).length,
  }));
  const maxBand = Math.max(1, ...bandBuckets.map((b) => b.count));

  return (
    <div className="space-y-6">
      <div className="bg-indigo-900 border border-indigo-100 p-8 rounded-3xl text-white shadow-xl shadow-indigo-100">
        <h3 className="text-xl font-black uppercase tracking-tight">My Dashboard</h3>
        <p className="text-indigo-100 text-base mt-2">
          Hi, <span className="font-bold">{studentName || 'Student'}</span>. Here is your personal
          performance snapshot from your courses.
        </p>
        <p className="text-indigo-200 text-sm mt-1">Keep going — your progress is updated from your latest grades.</p>
        {loading && <p className="text-indigo-200 text-xs mt-2">Refreshing latest grades...</p>}
      </div>
      {error && <p className="text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 text-sm">{error}</p>}
      <>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">My courses</p>
            <p className="mt-2 text-2xl font-black text-gray-900">{percentages.length}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">My average</p>
            <p className="mt-2 text-2xl font-black text-emerald-600">{avg == null ? '—' : `${avg.toFixed(1)}%`}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Best course</p>
            <p className="mt-2 text-2xl font-black text-indigo-600">{best == null ? '—' : `${best.toFixed(1)}%`}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Needs focus</p>
            <p className="mt-2 text-2xl font-black text-amber-600">{lowest == null ? '—' : `${lowest.toFixed(1)}%`}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h4 className="text-sm font-bold text-gray-900 mb-4">Top course performance</h4>
            {topCourses.length === 0 ? (
              <p className="text-sm text-gray-500">No grade percentages available yet.</p>
            ) : (
              <div className="space-y-3">
                {topCourses.map((item) => (
                  <div key={item.course} className="flex items-center gap-3 text-xs">
                    <div className="w-36 truncate text-gray-700 font-medium">{item.course}</div>
                    <div className="flex-1 h-3 rounded-full bg-indigo-50 overflow-hidden">
                      <div
                        className="h-3 rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${Math.max(8, item.pct)}%` }}
                      />
                    </div>
                    <div className="w-10 text-right font-semibold text-indigo-700">{item.pct.toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h4 className="text-sm font-bold text-gray-900 mb-4">Grade distribution</h4>
            {percentages.length === 0 ? (
              <p className="text-sm text-gray-500">No graded courses available yet.</p>
            ) : (
              <div className="space-y-3">
                {bandBuckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-3 text-xs">
                    <div className="w-14 text-gray-600 font-semibold">{b.label}</div>
                    <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-3 rounded-full ${b.color} transition-all duration-500`}
                        style={{ width: `${(b.count / maxBand) * 100}%` }}
                      />
                    </div>
                    <div className="w-6 text-right font-semibold text-gray-700">{b.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    </div>
  );
};

const StudentCurriculumExplorer = ({ moodleUserId, studentName }) => {
  const [loadingInit, setLoadingInit] = useState(false);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [grades, setGrades] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const enrolledCourseIds = React.useMemo(() => {
    const ids = new Set();
    for (const g of grades) {
      if (g?.course_id != null) ids.add(Number(g.course_id));
    }
    return ids;
  }, [grades]);

  React.useEffect(() => {
    if (!moodleUserId) return;
    let cancelled = false;
    setLoadingInit(true);
    setError(null);
    // Load categories first so the Grade/Level selector renders quickly.
    apiFetch('/api/moodle/categories')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((categoriesData) => {
        if (cancelled) return;
        const nextCategories = Array.isArray(categoriesData?.categories) ? categoriesData.categories : [];
        setCategories(sortGradeLevelCategories(nextCategories));
      })
      .catch((res) => {
        if (cancelled) return;
        setError(res?.status ? messageForHttpStatus(res.status) : MSG.LOAD_CATEGORIES);
      })
      .finally(() => {
        if (!cancelled) setLoadingInit(false);
      });

    // Fetch grades in the background; this should not block category rendering.
    apiFetch(`/api/moodle/site-students/${moodleUserId}/grades`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((gradesData) => {
        if (cancelled) return;
        const nextGrades = Array.isArray(gradesData?.grades) ? gradesData.grades : [];
        setGrades(nextGrades);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep the selector usable even if grades are temporarily unavailable.
        setError((prev) => prev || MSG.LOAD_MY_GRADES_PARTIAL);
      });

    return () => {
      cancelled = true;
    };
  }, [moodleUserId]);

  React.useEffect(() => {
    if (!selectedCategoryId) {
      setCourses([]);
      setSelectedCourse(null);
      return;
    }

    let cancelled = false;
    setLoadingCourses(true);
    setSelectedCourse(null);
    setDetailItems([]);
    setDetailError(null);

    apiFetch(`/api/moodle/courses/${selectedCategoryId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.courses) ? data.courses : [];
        const filtered = list.filter((c) => enrolledCourseIds.has(Number(c.id)));
        setCourses(filtered);
      })
      .catch((res) => {
        if (cancelled) return;
        setError(res?.status ? messageForHttpStatus(res.status) : MSG.LOAD_COURSES_CATEGORY);
      })
      .finally(() => {
        if (!cancelled) setLoadingCourses(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, enrolledCourseIds]);

  const selectedCourseGrade = React.useMemo(() => {
    if (!selectedCourse?.id) return null;
    return grades.find((g) => Number(g.course_id) === Number(selectedCourse.id)) || null;
  }, [grades, selectedCourse]);

  const openCourseDetails = (course) => {
    if (!moodleUserId || !course?.id) return;
    setSelectedCourse(course);
    setDetailItems([]);
    setDetailError(null);
    setDetailLoading(true);

    apiFetch(`/api/moodle/course-grades-direct/${moodleUserId}/${course.id}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setDetailItems(Array.isArray(data?.items) ? data.items : []);
        } else {
          setDetailError(MSG.LOAD_DETAILED_GRADES);
        }
      })
      .catch((res) =>
        setDetailError(
          res?.status ? messageForHttpStatus(res.status) : MSG.LOAD_DETAILED_GRADES
        )
      )
      .finally(() => setDetailLoading(false));
  };

  const visibleDetailItems = React.useMemo(() => {
    const selectedName = String(selectedCourse?.fullname || selectedCourse?.shortname || '').trim().toLowerCase();
    return detailItems.filter((item) => {
      const itemName = String(item?.item_name || '').trim();
      const itemNameLower = itemName.toLowerCase();
      // Hide only total/summary rows; keep regular items even when grade is empty.
      if (itemNameLower === 'course total') return false;
      if (selectedName && itemNameLower === selectedName) return false;
      return true;
    });
  }, [detailItems, selectedCourse]);

  return (
    <div className="space-y-6">
      <div className="bg-indigo-900 border border-indigo-100 p-8 rounded-3xl text-white shadow-xl shadow-indigo-100">
        <h3 className="text-xl font-black uppercase tracking-tight">{SIS_NAV.curriculum.label}</h3>
        <p className="text-indigo-200 text-sm mt-1">
          {studentName ? `${studentName}, ` : ''}select a grade level, then a course, then view your detailed grades.
        </p>
      </div>

      {error && <p className="text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 text-sm">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h4 className="font-bold text-gray-800 mb-3">1) Select Grade/Level</h4>
          {loadingInit ? (
            <p className="text-sm text-gray-500">Loading categories…</p>
          ) : (
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm"
            >
              <option value="">— Select —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h4 className="font-bold text-gray-800 mb-3">2) Select Course</h4>
          {!selectedCategoryId ? (
            <p className="text-sm text-gray-500">Pick a grade level first.</p>
          ) : loadingCourses ? (
            <p className="text-sm text-gray-500">Loading your courses…</p>
          ) : courses.length === 0 ? (
            <p className="text-sm text-gray-500">No enrolled courses found under this grade level.</p>
          ) : (
            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
              {courses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openCourseDetails(c)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    Number(selectedCourse?.id) === Number(c.id)
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-bold text-gray-900">{c.fullname || c.shortname || `Course ${c.id}`}</div>
                  <div className="text-xs text-gray-500">Course ID: {c.id}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h4 className="font-bold text-gray-800 mb-3">3) Course Grades</h4>
          {!selectedCourse ? (
            <p className="text-sm text-gray-500">Select a course to view your grades.</p>
          ) : (
            <div className="space-y-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Selected Course</p>
                <p className="text-sm font-bold text-indigo-900 mt-1">
                  {selectedCourse.fullname || selectedCourse.shortname || `Course ${selectedCourse.id}`}
                </p>
                <p className="text-xs text-indigo-700 mt-1">
                  Final grade:{' '}
                  <span className="font-semibold">
                    {selectedCourseGrade?.grade ?? '—'}
                    {selectedCourseGrade?.course_total_percentage != null
                      ? ` (${selectedCourseGrade.course_total_percentage}%)`
                      : ''}
                  </span>
                </p>
              </div>

              {visibleDetailItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const courseLabel = (
                      selectedCourse?.fullname ||
                      selectedCourse?.shortname ||
                      `course-${selectedCourse?.id || 'unknown'}`
                    )
                      .replace(/[^\w\s-]/g, '')
                      .trim()
                      .replace(/\s+/g, '-')
                      .toLowerCase();
                    const studentLabel = (studentName || 'student')
                      .replace(/[^\w\s-]/g, '')
                      .trim()
                      .replace(/\s+/g, '-')
                      .toLowerCase();
                    const date = new Date().toISOString().slice(0, 10);
                    const rows = visibleDetailItems.map((item) => ({
                      'Item Name': item.item_name || '',
                      Grade: item.grade_text || '',
                      Percentage: item.percentage || '',
                      Weight: item.weight || '',
                      Range: item.range || '',
                    }));
                    downloadCsv(`${studentLabel}-grades-detail-${courseLabel}-${date}.csv`, rows);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                >
                  <Download size={14} />
                  Export CSV
                </button>
              )}

              {detailError && <InlineStateMessage type="error">{detailError}</InlineStateMessage>}
              {detailLoading ? (
                <InlineStateMessage>Loading detailed grade items...</InlineStateMessage>
              ) : visibleDetailItems.length === 0 ? (
                <InlineStateMessage>No detailed grade items available for this course.</InlineStateMessage>
              ) : (
                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                  {visibleDetailItems.map((item) => (
                    <div
                      key={`${item.item_name || ''}-${item.weight || ''}-${item.range || ''}-${item.grade_text || ''}`}
                      className="border border-gray-100 rounded-xl p-3 bg-gray-50/70"
                    >
                      <p className="text-sm font-semibold text-gray-900">{item.item_name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Grade</span>
                        <span className="inline-flex items-center rounded-md bg-indigo-100 px-2 py-1 text-sm font-extrabold text-indigo-800">
                          {item.grade_text || '—'}
                        </span>
                        {item.percentage && (
                          <>
                            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Percentage</span>
                            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-sm font-extrabold text-emerald-800">
                              {item.percentage}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminMoodleSync = ({ lockedMoodleUserId = null }) => {
  const isStudentScoped = !!lockedMoodleUserId;
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(lockedMoodleUserId ? String(lockedMoodleUserId) : '');
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [detailCourse, setDetailCourse] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentsRefreshing, setStudentsRefreshing] = useState(false);

  const handleRefreshStudentsFromMoodle = () => {
    if (isStudentScoped) return;
    setStudentsRefreshing(true);
    setError(null);
    setMessage(null);
    clearSiteStudentsCache();
    apiFetch('/api/moodle/site-students?refresh=1')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = data.students || [];
        setStudents(list);
        writeSiteStudentsCache(list, data.cached_at);
        if (
          selectedStudentId &&
          !list.some((s) => String(s.id) === String(selectedStudentId))
        ) {
          setSelectedStudentId(list.length ? String(list[0].id) : '');
          setGrades([]);
        }
        setPickerOpen(false);
        setMessage(MSG.REFRESH_STUDENTS_SUCCESS);
      })
      .catch(() => setError(MSG.LOAD_STUDENTS_REFRESH))
      .finally(() => setStudentsRefreshing(false));
  };

  useEffect(() => {
    if (isStudentScoped) {
      setStudents([{ id: lockedMoodleUserId, fullname: 'My account' }]);
      setSelectedStudentId(String(lockedMoodleUserId));
      return;
    }

    let cancelled = false;
    const cached = readSiteStudentsCache();
    if (cached?.students?.length) {
      setStudents(cached.students);
      if (!selectedStudentId) {
        setSelectedStudentId(String(cached.students[0].id));
      }
      setLoading(false);
      setStudentsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    apiFetch('/api/moodle/site-students')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (cancelled) return;
        const list = data.students || [];
        setStudents(list);
        writeSiteStudentsCache(list, data.cached_at);
        if (list.length && !selectedStudentId) {
          setSelectedStudentId(String(list[0].id));
        }
        setPickerOpen(false);
      })
      .catch(() => {
        if (!cancelled && !cached?.students?.length) {
          setError(MSG.LOAD_STUDENTS);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setStudentsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isStudentScoped, lockedMoodleUserId]);

  const filteredStudents = React.useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const fullname = String(s.fullname || '').toLowerCase();
      const username = String(s.username || '').toLowerCase();
      const email = String(s.email || '').toLowerCase();
      return fullname.includes(q) || username.includes(q) || email.includes(q);
    });
  }, [students, studentSearch]);

  useEffect(() => {
    setGrades([]);
    setMessage(null);
  }, [selectedStudentId]);

  const handleFetchFromMoodle = () => {
    if (!selectedStudentId) return;
    setFetching(true);
    setError(null);
    setMessage(null);
    apiFetch(`/api/moodle/site-students/${selectedStudentId}/grades`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setMessage(MSG.FETCH_GRADES_SUCCESS);
          setGrades(data.grades || []);
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem('sis_last_grade_fetch', new Date().toISOString());
            } catch {
              // ignore storage errors
            }
          }
        } else {
          setError(MSG.FETCH_GRADES_FAILED);
        }
      })
      .catch(() => setError(MSG.FETCH_GRADES_FAILED))
      .finally(() => setFetching(false));
  };

  const handleViewDetails = (course) => {
    if (!selectedStudentId || !course.course_id) return;
    const student = students.find((s) => String(s.id) === selectedStudentId);
    const studentName =
      student?.fullname || student?.email || student?.username || `User ${selectedStudentId}`;
    setDetailCourse({ ...course, student_name: studentName });
    setDetailItems([]);
    setDetailError(null);
    setDetailLoading(true);
    apiFetch(`/api/moodle/course-grades-direct/${selectedStudentId}/${course.course_id}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setDetailItems(data.items || []);
        } else {
          setDetailError(MSG.LOAD_DETAILED_GRADES);
        }
      })
      .catch(() => setDetailError(MSG.LOAD_DETAILED_GRADES))
      .finally(() => setDetailLoading(false));
  };

  const gradeCoursesWithPct = grades
    .map((g) => {
      if (g.course_total_percentage != null) {
        const pct = Number(g.course_total_percentage);
        if (Number.isNaN(pct)) return null;
        return {
          course_id: g.course_id,
          course_name: g.course_name || `Course ${g.course_id || ''}`,
          percentage: Math.max(0, Math.min(100, pct)),
        };
      }
      const gradeVal = typeof g.grade === 'number' ? g.grade : Number(g.grade);
      const maxVal = typeof g.max_grade === 'number' ? g.max_grade : Number(g.max_grade);
      if (Number.isNaN(gradeVal)) {
        return null;
      }
      const pct =
        !maxVal || Number.isNaN(maxVal) || maxVal === 0 ? gradeVal : (gradeVal / maxVal) * 100;
      return {
        course_id: g.course_id,
        course_name: g.course_name || `Course ${g.course_id || ''}`,
        percentage: Math.max(0, Math.min(100, pct)),
      };
    })
    .filter(Boolean);

  const excellingCourses = gradeCoursesWithPct
    .filter((c) => c.percentage >= 70)
    .sort((a, b) => b.percentage - a.percentage);
  const progressingCourses = gradeCoursesWithPct
    .filter((c) => c.percentage >= 50 && c.percentage < 70)
    .sort((a, b) => b.percentage - a.percentage);
  const needsAttentionCourses = gradeCoursesWithPct
    .filter((c) => c.percentage < 50)
    .sort((a, b) => a.percentage - b.percentage);

  return (
    <div className="space-y-6">
      <div className="bg-indigo-900 border border-indigo-100 p-6 sm:p-8 rounded-3xl flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 text-white shadow-xl shadow-indigo-100">
        <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
          <BarChart3 size={32} className="text-indigo-300" />
        </div>
        <div>
          <h3 className="text-xl font-black uppercase tracking-tight text-white">{SIS_NAV.moodle.label}</h3>
          <p className="text-indigo-200 text-sm mt-1 max-w-md">
            {isStudentScoped
              ? `Fetch your latest grades and see how you are doing by course. Use ${SIS_NAV.curriculum.label} for level → course → detailed navigation.`
              : 'Search for a student, fetch their grades, and review performance by course.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h4 className="font-bold mb-4 text-gray-800 flex items-center justify-between gap-2 flex-wrap">
            <span>Students &amp; Fetch</span>
            <div className="flex items-center gap-2">
              {studentsRefreshing && (
                <span className="text-xs font-normal text-gray-400">Updating list…</span>
              )}
              {!isStudentScoped && (
                <button
                  type="button"
                  onClick={handleRefreshStudentsFromMoodle}
                  disabled={studentsRefreshing || loading}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg border border-indigo-200 disabled:opacity-50"
                  title="Fetch latest student list (ignores cache)"
                >
                  <RefreshCw size={13} className={studentsRefreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
              )}
            </div>
          </h4>
          {error && (
            <div className="mb-4">
              <InlineStateMessage type="error">{error}</InlineStateMessage>
            </div>
          )}
          {message && (
            <p className="text-green-600 bg-green-50 p-2.5 rounded-xl border border-green-100 text-sm mb-4 flex items-center">
              <CheckCircle className="text-green-500 mr-2" size={18} />
              {message}
            </p>
          )}
          {loading && students.length === 0 ? (
            <InlineStateMessage>Loading students...</InlineStateMessage>
          ) : (
            <div className="space-y-3">
              {!isStudentScoped && (
                <>
                  <label className="block text-sm font-medium text-gray-700">Select student</label>
                  <input
                    type="search"
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setPickerOpen(true);
                    }}
                    onFocus={() => setPickerOpen(true)}
                    placeholder="Search by name, username, or email"
                    className="w-full mb-2 px-4 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((open) => !open)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-left bg-white flex items-center justify-between"
                >
                  <span className={selectedStudentId ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedStudentId
                      ? (() => {
                          const s = students.find(
                            (u) => String(u.id) === String(selectedStudentId)
                          );
                          if (!s) return '— Select —';
                          return `${s.fullname} – ${s.email || s.username || ''}`;
                        })()
                      : '— Select —'}
                  </span>
                  <span className="ml-2 text-gray-400 text-xs">{pickerOpen ? '▲' : '▼'}</span>
                </button>
                {pickerOpen && (
                  <div className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20">
                    {filteredStudents.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => {
                          setSelectedStudentId(String(s.id));
                          setPickerOpen(false);
                          setStudentSearch('');
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 ${
                          String(s.id) === String(selectedStudentId)
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-gray-800'
                        }`}
                      >
                        <div className="font-medium truncate">{s.fullname}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {s.email || s.username || ''}
                        </div>
                      </button>
                    ))}
                    {filteredStudents.length === 0 && (
                      <div className="px-4 py-2 text-xs text-gray-500">
                        {students.length === 0 ? MSG.EMPTY_NO_STUDENTS_FOUND : MSG.EMPTY_NO_SEARCH_MATCH}
                      </div>
                    )}
                  </div>
                )}
                  </div>
                </>
              )}
              <button
                onClick={handleFetchFromMoodle}
                disabled={!selectedStudentId || fetching}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {fetching ? 'Fetching…' : isStudentScoped ? 'Load my grades' : 'Fetch grades'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold flex items-center text-gray-800">
              <CheckCircle className="text-green-500 mr-2" size={18} />
              Grades
            </h4>
            <button
              type="button"
              onClick={() => {
                const studentLabel = students.find((s) => String(s.id) === selectedStudentId)?.email || selectedStudentId;
                const rows = [['Course', 'Grade', 'Max grade']];
                grades.forEach((g) => {
                  rows.push([
                    g.course_name || '',
                    g.grade != null ? g.grade : '',
                    g.max_grade != null ? g.max_grade : '',
                  ]);
                });
                downloadCsv(`grades-${studentLabel}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
              }}
              disabled={grades.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg border border-indigo-200 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
          {grades.length === 0 ? (
            <p className="text-gray-500 text-sm">
              Select a student and click &quot;Fetch grades&quot; to see grades here.
            </p>
          ) : (
            <div className="space-y-2">
              {grades.map((g, i) => {
                const pct =
                  g.course_total_percentage != null
                    ? g.course_total_percentage
                    : g.max_grade
                    ? (Number(g.grade) / Number(g.max_grade)) * 100
                    : Number(g.grade);
                const displayPct =
                  pct != null && !Number.isNaN(pct) ? `${pct.toFixed(2).replace(/\.00$/, '')}%` : '—';
                return (
                  <div
                    key={i}
                    className="flex items-center py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-800">{g.course_name}</span>
                    </div>
                    <div className="w-24 text-center">
                      <span className="text-sm text-gray-700 font-semibold">{displayPct}</span>
                    </div>
                    <div className="w-24 text-right">
                      {g.course_id && (
                        <button
                          onClick={() => handleViewDetails(g)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          View details
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {gradeCoursesWithPct.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">
            Course performance overview
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h5 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">
                Excelling in
              </h5>
              {excellingCourses.length === 0 ? (
                <p className="text-xs text-gray-500">No courses at 70% or above.</p>
              ) : (
                <div className="space-y-2">
                  {excellingCourses.map((c) => {
                    const width = Math.max(10, c.percentage);
                    return (
                      <div
                        key={c.course_id || c.course_name}
                        className="flex items-center gap-3 text-xs"
                      >
                        <div className="w-32 truncate text-gray-700 font-medium">
                          {c.course_name}
                        </div>
                        <div className="flex-1 h-3 rounded-full bg-emerald-50 overflow-hidden">
                          <div
                            className="h-3 rounded-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <div className="w-10 text-right text-emerald-700 font-semibold">
                          {c.percentage.toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <h5 className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">
                Progressing well
              </h5>
              {progressingCourses.length === 0 ? (
                <p className="text-xs text-gray-500">No courses between 50% and 70%.</p>
              ) : (
                <div className="space-y-2">
                  {progressingCourses.map((c) => {
                    const width = Math.max(10, c.percentage);
                    return (
                      <div
                        key={c.course_id || c.course_name}
                        className="flex items-center gap-3 text-xs"
                      >
                        <div className="w-32 truncate text-gray-700 font-medium">
                          {c.course_name}
                        </div>
                        <div className="flex-1 h-3 rounded-full bg-amber-50 overflow-hidden">
                          <div
                            className="h-3 rounded-full bg-amber-500 transition-all duration-500"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <div className="w-10 text-right text-amber-700 font-semibold">
                          {c.percentage.toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <h5 className="text-xs font-bold text-rose-600 uppercase tracking-widest mb-2">
                Needs attention
              </h5>
              {needsAttentionCourses.length === 0 ? (
                <p className="text-xs text-gray-500">No courses below 50%.</p>
              ) : (
                <div className="space-y-2">
                  {needsAttentionCourses.map((c) => {
                    const width = Math.max(10, c.percentage);
                    return (
                      <div
                        key={c.course_id || c.course_name}
                        className="flex items-center gap-3 text-xs"
                      >
                        <div className="w-32 truncate text-gray-700 font-medium">
                          {c.course_name}
                        </div>
                        <div className="flex-1 h-3 rounded-full bg-rose-50 overflow-hidden">
                          <div
                            className="h-3 rounded-full bg-rose-500 transition-all duration-500"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <div className="w-10 text-right text-rose-700 font-semibold">
                          {c.percentage.toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {detailCourse && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-indigo-900 text-white">
              <div>
                <h4 className="text-sm font-bold">
                  Detailed grades • {detailCourse.course_name}
                </h4>
                {detailCourse.student_name && (
                  <p className="text-indigo-200 text-xs mt-1">Student: {detailCourse.student_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {detailItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const studentName = detailCourse.student_name ?? '';
                      const rows = detailItems.map((item) => ({
                        'Student': studentName,
                        'Grade item': item.item_name ?? '',
                        'Weight': item.weight ?? '',
                        'Grade': item.grade_text ?? '',
                        'Range': item.range ?? '',
                        'Percentage': item.percentage ?? '',
                        'Contribution': item.contribution_to_total ?? '',
                      }));
                      const courseSafe = (detailCourse.course_name || 'course').replace(/[^\w\s-]/g, '');
                      const studentSafe = studentName.replace(/[^\w\s-]/g, '') || 'student';
                      const date = new Date().toISOString().slice(0, 10);
                      downloadCsv(`${studentSafe}-grades-detail-${courseSafe}-${date}.csv`, rows);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                )}
                <button
                  onClick={() => {
                    setDetailCourse(null);
                    setDetailItems([]);
                    setDetailError(null);
                  }}
                  className="px-2 py-1 rounded-lg hover:bg-white/10 text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {detailLoading ? (
                <InlineStateMessage>Loading detailed grades...</InlineStateMessage>
              ) : detailError ? (
                <InlineStateMessage type="error">{detailError}</InlineStateMessage>
              ) : detailItems.length === 0 ? (
                <InlineStateMessage>No detailed items found for this course.</InlineStateMessage>
              ) : (
                <div className="text-xs md:text-sm">
                  <div className="grid grid-cols-3 md:grid-cols-7 gap-2 px-2 py-2 border-b text-[10px] md:text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="col-span-2 md:col-span-2">Grade item</div>
                    <div className="hidden md:block">Weight</div>
                    <div>Grade</div>
                    <div className="hidden md:block">Range</div>
                    <div className="hidden md:block">Percentage</div>
                    <div className="hidden md:block text-right">Contribution</div>
                  </div>
                  <ul className="divide-y">
                    {detailItems.map((item) => (
                      <li
                        key={`${item.item_name || ''}-${item.weight || ''}-${item.range || ''}-${item.grade_text || ''}`}
                        className="py-2 px-2 grid grid-cols-3 md:grid-cols-7 gap-2 items-center"
                      >
                        <div className="col-span-2 md:col-span-2 font-medium text-gray-800">
                          {item.item_name}
                        </div>
                        <div className="hidden md:block text-gray-600">
                          {item.weight || '—'}
                        </div>
                        <div className="text-gray-800">
                          {item.grade_text || '—'}
                        </div>
                        <div className="hidden md:block text-gray-600">
                          {item.range || '—'}
                        </div>
                        <div className="hidden md:block text-gray-600">
                          {item.percentage || '—'}
                        </div>
                        <div className="hidden md:block text-right text-gray-800">
                          {item.contribution_to_total || '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


