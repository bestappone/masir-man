-- مسیر من - ساختار دیتابیس D1 (سازگار با SQLite/D1)
-- نکته: بدون PRAGMA، بدون TRIGGER، بدون TRANSACTION تا Cloudflare خطا ندهد.
-- همه دستورات IF NOT EXISTS هستند و چندبار اجرا شدن آن‌ها مشکلی ایجاد نمی‌کند.

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  referral_code TEXT UNIQUE,
  referred_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade TEXT,
  field_of_study TEXT,
  city TEXT,
  birth_year INTEGER,
  favorite_lessons TEXT,
  goal_text TEXT,
  about TEXT,
  avatar_url TEXT,
  chosen_major_slug TEXT,
  chosen_job_slug TEXT,
  consent_privacy INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'likert',
  est_minutes INTEGER NOT NULL DEFAULT 10,
  level TEXT,
  science_note TEXT,
  result_note TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  suggested_majors TEXT,
  suggested_jobs TEXT,
  suggested_skills TEXT,
  next_action TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (test_id, code)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  category_code TEXT NOT NULL,
  q_text TEXT NOT NULL,
  level TEXT,
  weight REAL NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  o_text TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  scores_json TEXT NOT NULL,
  top_codes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_result_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  score REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS majors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  suitable_for TEXT,
  key_lessons TEXT,
  abilities TEXT,
  skills TEXT,
  universities TEXT,
  study_path TEXT,
  related_jobs TEXT,
  job_market TEXT,
  future_skills TEXT,
  pros TEXT,
  challenges TEXT,
  faq TEXT,
  similar_majors TEXT,
  holland_codes TEXT,
  konkur_group TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  intro TEXT,
  duties TEXT,
  skills TEXT,
  related_majors TEXT,
  entry_path TEXT,
  education TEXT,
  essential_skills TEXT,
  tools TEXT,
  work_env TEXT,
  growth_path TEXT,
  faq TEXT,
  related_experts TEXT,
  holland_codes TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  level TEXT,
  how_to_learn TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  grade TEXT,
  field_name TEXT,
  description TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  category TEXT,
  level TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT,
  summary TEXT,
  body TEXT,
  image_url TEXT,
  author TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS career_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  holland_codes TEXT,
  majors TEXT,
  jobs TEXT,
  steps TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  specialty TEXT,
  experience TEXT,
  city TEXT,
  description TEXT,
  coaching_model TEXT,
  coach_types TEXT,
  background TEXT,
  documents_note TEXT,
  tags TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 45,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provider_modes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE (provider_id, mode)
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  is_booked INTEGER NOT NULL DEFAULT 0,
  UNIQUE (provider_id, start_at)
);

CREATE TABLE IF NOT EXISTS coach_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 45
);

CREATE TABLE IF NOT EXISTS coaching_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sessions_count INTEGER NOT NULL DEFAULT 4,
  weeks INTEGER NOT NULL DEFAULT 8,
  price INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS group_coaching_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  coach_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
  capacity INTEGER NOT NULL DEFAULT 10,
  weeks INTEGER NOT NULL DEFAULT 4,
  price INTEGER NOT NULL DEFAULT 0,
  sessions_desc TEXT,
  actions_desc TEXT,
  rules TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  percent INTEGER NOT NULL DEFAULT 5,
  kind TEXT NOT NULL DEFAULT 'manual',
  is_used INTEGER NOT NULL DEFAULT 0,
  used_request_id INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consultation_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL,
  mode TEXT,
  slot_id INTEGER,
  group_program_id INTEGER,
  package_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  price INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  final_amount INTEGER NOT NULL DEFAULT 0,
  coupon_id INTEGER,
  note TEXT,
  parent_consent INTEGER NOT NULL DEFAULT 0,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES consultation_requests(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL UNIQUE REFERENCES availability_slots(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES consultation_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  tracking_code TEXT NOT NULL,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS study_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grade TEXT,
  field_name TEXT,
  subjects_json TEXT NOT NULL,
  daily_minutes INTEGER NOT NULL,
  study_days TEXT NOT NULL,
  goal TEXT,
  exam_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exam_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grade TEXT,
  field_name TEXT,
  target TEXT,
  exam_date TEXT,
  current_status TEXT,
  strong_json TEXT,
  weak_json TEXT,
  daily_minutes INTEGER NOT NULL,
  study_days TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER,
  plan_kind TEXT NOT NULL DEFAULT 'study',
  title TEXT NOT NULL,
  subject TEXT,
  task_date TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  start_date TEXT,
  end_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'not_started',
  progress INTEGER NOT NULL DEFAULT 0,
  is_main INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fail_reason TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coaching_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
  coach_type TEXT NOT NULL,
  title TEXT NOT NULL,
  weeks INTEGER NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'active',
  request_id INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coaching_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES coaching_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  week_no INTEGER,
  status TEXT NOT NULL DEFAULT 'not_started',
  progress INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS coaching_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES coaching_programs(id) ON DELETE CASCADE,
  goal_id INTEGER,
  week_no INTEGER,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fail_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER REFERENCES coaching_programs(id) ON DELETE CASCADE,
  request_id INTEGER,
  coach_id INTEGER,
  user_id INTEGER NOT NULL,
  coach_type TEXT,
  duration_min INTEGER NOT NULL DEFAULT 45,
  price INTEGER NOT NULL DEFAULT 0,
  mode TEXT,
  session_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes_shared TEXT,
  next_actions TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coaching_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id INTEGER,
  done_today TEXT,
  went_well TEXT,
  was_hard TEXT,
  obstacles TEXT,
  next_week TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_coaching_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES group_coaching_programs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (program_id, user_id)
);

CREATE TABLE IF NOT EXISTS smart_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL DEFAULT 'always',
  trigger_value TEXT,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  group_name TEXT,
  label TEXT,
  is_public INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id INTEGER PRIMARY KEY,
  card_number TEXT,
  card_owner TEXT,
  bank_name TEXT,
  instructions TEXT,
  rules TEXT,
  min_amount INTEGER NOT NULL DEFAULT 0,
  max_amount INTEGER NOT NULL DEFAULT 100000000,
  receipt_required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  provider_name TEXT,
  base_url TEXT,
  model TEXT,
  system_prompt TEXT,
  temperature REAL NOT NULL DEFAULT 0.4,
  max_tokens INTEGER NOT NULL DEFAULT 700,
  daily_limit INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placement TEXT NOT NULL DEFAULT 'home_ad',
  title TEXT,
  media_type TEXT NOT NULL DEFAULT 'image',
  media_url TEXT,
  poster_url TEXT,
  link_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  msg_role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limits (
  rl_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_options_q ON options(question_id);
CREATE INDEX IF NOT EXISTS idx_results_user ON test_results(user_id);
CREATE INDEX IF NOT EXISTS idx_items_result ON test_result_items(result_id);
CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(provider_type, status);
CREATE INDEX IF NOT EXISTS idx_slots_provider ON availability_slots(provider_id, start_at);
CREATE INDEX IF NOT EXISTS idx_requests_user ON consultation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_provider ON consultation_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON consultation_requests(status);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON study_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_actions_user ON actions(user_id);
CREATE INDEX IF NOT EXISTS idx_actions_goal ON actions(goal_id);
CREATE INDEX IF NOT EXISTS idx_cprog_user ON coaching_programs(user_id);
CREATE INDEX IF NOT EXISTS idx_cprog_coach ON coaching_programs(coach_id);
CREATE INDEX IF NOT EXISTS idx_cact_prog ON coaching_actions(program_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON coaching_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_user ON coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_user ON ai_messages(user_id, created_at);
