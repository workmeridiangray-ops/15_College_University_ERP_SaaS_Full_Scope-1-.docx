-- Campus ERP initial schema. All tenant tables carry institution_id.
CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price_inr_monthly integer NOT NULL,
  max_students integer NOT NULL,
  max_staff integer NOT NULL
);

CREATE TABLE institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','suspended','cancelled')),
  plan_id uuid REFERENCES plans(id),
  trial_ends_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  contact_email text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  phone text,
  role text NOT NULL CHECK (role IN ('super_admin','institution_admin','admissions_officer','accountant','hod','faculty','librarian','hr_manager','student','parent','applicant')),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'super_admin') = (institution_id IS NULL))
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE INDEX users_inst_idx ON users (institution_id, role);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE login_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  institution_id uuid,
  user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_inst_idx ON audit_log (institution_id, created_at DESC);

CREATE TABLE idempotency_keys (
  key text NOT NULL,
  institution_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key)
);

CREATE TABLE academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  label text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  UNIQUE (institution_id, label)
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  hod_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (institution_id, code)
);

CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text NOT NULL,
  duration_years integer NOT NULL DEFAULT 3,
  seats integer NOT NULL DEFAULT 60,
  UNIQUE (institution_id, code)
);

CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  year_no integer NOT NULL DEFAULT 1,
  UNIQUE (institution_id, program_id, year_no, name)
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  credits integer NOT NULL DEFAULT 3,
  semester integer NOT NULL DEFAULT 1,
  UNIQUE (institution_id, code)
);

CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_no text NOT NULL,
  designation text NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  base_salary_paise bigint NOT NULL DEFAULT 0,
  joined_on date NOT NULL DEFAULT current_date,
  UNIQUE (institution_id, employee_no),
  UNIQUE (user_id)
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolment_no text NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  dob date,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  section_id uuid REFERENCES sections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','graduated','withdrawn','suspended')),
  admitted_on date NOT NULL DEFAULT current_date,
  UNIQUE (institution_id, enrolment_no),
  UNIQUE (user_id)
);
CREATE INDEX students_section_idx ON students (institution_id, section_id);

CREATE TABLE guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  relation text NOT NULL,
  phone text,
  email text
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  filename text NOT NULL,
  stored_name text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_owner_idx ON documents (institution_id, owner_type, owner_id);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  tracking_code text UNIQUE NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  dob date,
  previous_percentage numeric(5,2),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','shortlisted','accepted','rejected')),
  remarks text,
  decided_by uuid,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, program_id, email)
);

CREATE TABLE timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  faculty_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  room text NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX slots_idx ON timetable_slots (institution_id, weekday);

CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  on_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  marked_by uuid,
  UNIQUE (course_id, student_id, on_date)
);

CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_at timestamptz NOT NULL,
  max_marks integer NOT NULL DEFAULT 10,
  created_by uuid NOT NULL REFERENCES users(id)
);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  body text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  marks numeric(6,2),
  feedback text,
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  name text NOT NULL,
  max_marks integer NOT NULL,
  weight_pct integer NOT NULL DEFAULT 100 CHECK (weight_pct BETWEEN 1 AND 100),
  exam_date date,
  published boolean NOT NULL DEFAULT false
);

CREATE TABLE marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained numeric(6,2) NOT NULL CHECK (marks_obtained >= 0),
  version integer NOT NULL DEFAULT 1,
  entered_by uuid,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','students','staff','parents')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notif_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  due_on date NOT NULL
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id uuid REFERENCES fee_structures(id) ON DELETE SET NULL,
  number text NOT NULL,
  description text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  concession_paise bigint NOT NULL DEFAULT 0 CHECK (concession_paise >= 0),
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, number),
  UNIQUE (student_id, fee_structure_id),
  CHECK (concession_paise <= amount_paise)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  method text NOT NULL CHECK (method IN ('cash','upi','card','bank','online')),
  reference text,
  provider_order_id text,
  provider_payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending','succeeded','failed','refunded')),
  receipt_no text,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, receipt_no)
);

CREATE TABLE webhook_events (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL,
  isbn text,
  copies_total integer NOT NULL CHECK (copies_total >= 0),
  copies_available integer NOT NULL CHECK (copies_available >= 0),
  CHECK (copies_available <= copies_total)
);

CREATE TABLE book_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  issued_on date NOT NULL DEFAULT current_date,
  due_on date NOT NULL,
  returned_on date,
  fine_paise bigint NOT NULL DEFAULT 0
);

CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  kind text NOT NULL DEFAULT 'paid' CHECK (kind IN ('paid','unpaid')),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  CHECK (to_date >= from_date)
);

CREATE TABLE payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  month text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, month)
);

CREATE TABLE payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  gross_paise bigint NOT NULL,
  deductions_paise bigint NOT NULL,
  net_paise bigint NOT NULL,
  unpaid_leave_days integer NOT NULL DEFAULT 0,
  UNIQUE (run_id, staff_id)
);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (code, name, price_inr_monthly, max_students, max_staff) VALUES
  ('starter', 'Starter', 4999, 500, 50),
  ('growth', 'Growth', 14999, 3000, 300),
  ('enterprise', 'Enterprise', 39999, 100000, 5000);
