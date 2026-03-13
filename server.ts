import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("campus.db");

// ... (Database initialization remains the same)
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    roll_number TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    year INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS faculty (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    designation TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    instructor TEXT NOT NULL,
    credits INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS classrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT UNIQUE NOT NULL,
    building TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    type TEXT CHECK(type IN ('Lab', 'Lecture Hall', 'Seminar Room')) NOT NULL,
    purpose TEXT
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS classroom_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id INTEGER NOT NULL,
    booked_by TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    purpose TEXT NOT NULL,
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    organizer TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT CHECK(status IN ('Available', 'In Use', 'Maintenance')) DEFAULT 'Available',
    assigned_to TEXT
  );

  CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT DEFAULT CURRENT_TIMESTAMP,
    priority TEXT CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Low'
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name TEXT NOT NULL,
    course_name TEXT NOT NULL,
    date TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK(status IN ('Present', 'Absent')) NOT NULL
  );
`);

// Seed data if empty
const studentCount = db.prepare("SELECT COUNT(*) as count FROM students").get() as { count: number };
if (studentCount.count === 0) {
  db.prepare("INSERT INTO students (name, email, roll_number, department, year) VALUES (?, ?, ?, ?, ?)").run(
    "Arjun Sharma", "arjun@example.com", "CS101", "Computer Science", 1
  );
  db.prepare("INSERT INTO faculty (name, email, department, designation) VALUES (?, ?, ?, ?)").run(
    "Dr. Rajesh Kumar", "rajesh@campus.edu", "Computer Science", "Professor"
  );
  db.prepare("INSERT INTO courses (name, code, instructor, credits) VALUES (?, ?, ?, ?)").run(
    "Introduction to Programming", "CS101", "Dr. Rajesh Kumar", 4
  );
  db.prepare("INSERT INTO classrooms (room_number, building, capacity, type, purpose) VALUES (?, ?, ?, ?, ?)").run(
    "L-101", "Main Block", 60, "Lecture Hall", "General lectures and large group presentations"
  );
  db.prepare("INSERT INTO classrooms (room_number, building, capacity, type, purpose) VALUES (?, ?, ?, ?, ?)").run(
    "Lab-202", "Science Wing", 30, "Lab", "Advanced Computer Science and AI research"
  );
  db.prepare("INSERT INTO classrooms (room_number, building, capacity, type, purpose) VALUES (?, ?, ?, ?, ?)").run(
    "S-303", "Admin Block", 20, "Seminar Room", "Executive meetings and small group discussions"
  );
  db.prepare("INSERT INTO profile (name, role, email, phone) VALUES (?, ?, ?, ?)").run(
    "Aditi Verma", "System Administrator • Campus Operations", "aditi@smartcampus.edu", "+91 98765 43210"
  );
  db.prepare("INSERT INTO events (title, description, date, location, organizer) VALUES (?, ?, ?, ?, ?)").run(
    "Tech Fest 2026", "Annual technical festival", "2026-04-15", "Main Auditorium", "Student Council"
  );
  db.prepare("INSERT INTO resources (name, type, status) VALUES (?, ?, ?)").run(
    "Projector A1", "Hardware", "Available"
  );
  db.prepare("INSERT INTO notices (title, content, priority) VALUES (?, ?, ?)").run(
    "Welcome to Smart Campus", "We are excited to launch our new management system.", "High"
  );
  db.prepare("INSERT INTO attendance (student_name, course_name, status) VALUES (?, ?, ?)").run(
    "Arjun Sharma", "Introduction to Programming", "Present"
  );
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // WebSocket broadcast helper
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // API Routes
  app.get("/api/students", (req, res) => {
    const students = db.prepare("SELECT * FROM students").all();
    res.json(students);
  });

  app.post("/api/students", (req, res) => {
    const { name, email, roll_number, department, year } = req.body;
    try {
      const result = db.prepare("INSERT INTO students (name, email, roll_number, department, year) VALUES (?, ?, ?, ?, ?)").run(
        name, email, roll_number, department, year
      );
      broadcast({ type: 'NEW_STUDENT', message: `New student enrolled: ${name}` });
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/students/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.prepare("DELETE FROM students WHERE id = ?").run(id);
      broadcast({ type: 'STUDENT_DELETED', message: `Student record deleted` });
      res.json({ status: 'ok' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/faculty", (req, res) => {
    const faculty = db.prepare("SELECT * FROM faculty").all();
    res.json(faculty);
  });

  app.post("/api/faculty", (req, res) => {
    const { name, email, department, designation } = req.body;
    try {
      const result = db.prepare("INSERT INTO faculty (name, email, department, designation) VALUES (?, ?, ?, ?)").run(
        name, email, department, designation
      );
      broadcast({ type: 'NEW_FACULTY', message: `New faculty joined: ${name}` });
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/faculty/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.prepare("DELETE FROM faculty WHERE id = ?").run(id);
      broadcast({ type: 'FACULTY_DELETED', message: `Faculty record deleted` });
      res.json({ status: 'ok' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/courses", (req, res) => {
    const courses = db.prepare("SELECT * FROM courses").all();
    res.json(courses);
  });

  app.get("/api/classrooms", (req, res) => {
    const classrooms = db.prepare("SELECT * FROM classrooms").all();
    res.json(classrooms);
  });

  app.get("/api/bookings", (req, res) => {
    const bookings = db.prepare(`
      SELECT b.*, c.room_number 
      FROM classroom_bookings b 
      JOIN classrooms c ON b.classroom_id = c.id
    `).all();
    res.json(bookings);
  });

  app.post("/api/bookings", (req, res) => {
    const { classroom_id, booked_by, date, start_time, end_time, purpose } = req.body;
    const result = db.prepare("INSERT INTO classroom_bookings (classroom_id, booked_by, date, start_time, end_time, purpose) VALUES (?, ?, ?, ?, ?, ?)").run(
      classroom_id, booked_by, date, start_time, end_time, purpose
    );
    
    const classroom = db.prepare("SELECT room_number FROM classrooms WHERE id = ?").get(classroom_id) as any;
    broadcast({ 
      type: 'NEW_BOOKING', 
      message: `New booking for ${classroom.room_number} by ${booked_by}`,
      data: { room: classroom.room_number, by: booked_by }
    });
    
    res.status(201).json({ id: result.lastInsertRowid });
  });

  app.delete("/api/bookings/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.prepare("DELETE FROM classroom_bookings WHERE id = ?").run(id);
      broadcast({ type: 'BOOKING_DELETED', message: `Booking cancelled successfully` });
      res.json({ status: 'ok' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events", (req, res) => {
    const events = db.prepare("SELECT * FROM events").all();
    res.json(events);
  });

  app.post("/api/events", (req, res) => {
    const { title, description, date, location, organizer } = req.body;
    try {
      const result = db.prepare("INSERT INTO events (title, description, date, location, organizer) VALUES (?, ?, ?, ?, ?)").run(
        title, description, date, location, organizer
      );
      broadcast({ type: 'NEW_EVENT', message: `New Event: ${title}` });
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/events/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.prepare("DELETE FROM events WHERE id = ?").run(id);
      broadcast({ type: 'EVENT_DELETED', message: `Event removed from calendar` });
      res.json({ status: 'ok' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/resources", (req, res) => {
    const resources = db.prepare("SELECT * FROM resources").all();
    res.json(resources);
  });

  app.delete("/api/resources/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.prepare("DELETE FROM resources WHERE id = ?").run(id);
      broadcast({ type: 'RESOURCE_DELETED', message: `Resource removed from inventory` });
      res.json({ status: 'ok' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/notices", (req, res) => {
    const notices = db.prepare("SELECT * FROM notices ORDER BY date DESC").all();
    res.json(notices);
  });

  app.post("/api/resources", (req, res) => {
    const { name, type, status, assigned_to } = req.body;
    try {
      const result = db.prepare("INSERT INTO resources (name, type, status, assigned_to) VALUES (?, ?, ?, ?)").run(
        name, type, status || 'Available', assigned_to || null
      );
      broadcast({ type: 'NEW_RESOURCE', message: `New resource added: ${name}` });
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/attendance", (req, res) => {
    const attendance = db.prepare("SELECT * FROM attendance ORDER BY date DESC").all();
    res.json(attendance);
  });

  app.post("/api/attendance", (req, res) => {
    const { student_name, course_name, status } = req.body;
    try {
      const result = db.prepare("INSERT INTO attendance (student_name, course_name, status) VALUES (?, ?, ?)").run(
        student_name, course_name, status
      );
      broadcast({ type: 'ATTENDANCE_MARKED', message: `Attendance marked for ${student_name}` });
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/attendance/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.prepare("DELETE FROM attendance WHERE id = ?").run(id);
      broadcast({ type: 'ATTENDANCE_DELETED', message: `Attendance record deleted` });
      res.json({ status: 'ok' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notices", (req, res) => {
    const { title, content, priority } = req.body;
    const result = db.prepare("INSERT INTO notices (title, content, priority) VALUES (?, ?, ?)").run(
      title, content, priority
    );
    
    broadcast({ 
      type: 'NEW_NOTICE', 
      message: `New Announcement: ${title}`,
      data: { title, priority }
    });
    
    res.status(201).json({ id: result.lastInsertRowid });
  });

  app.get("/api/profile", (req, res) => {
    const profile = db.prepare("SELECT * FROM profile LIMIT 1").get();
    res.json(profile);
  });

  app.post("/api/profile", (req, res) => {
    const { name, role, email, phone } = req.body;
    db.prepare("UPDATE profile SET name = ?, role = ?, email = ?, phone = ? WHERE id = 1").run(
      name, role, email, phone
    );
    broadcast({ type: 'PROFILE_UPDATED', message: `Admin profile updated` });
    res.json({ status: 'ok' });
  });

  app.delete("/api/notices/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.prepare("DELETE FROM notices WHERE id = ?").run(id);
      broadcast({ type: 'NOTICE_DELETED', message: `Announcement removed` });
      res.json({ status: 'ok' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stats", (req, res) => {
    const studentCount = db.prepare("SELECT COUNT(*) as count FROM students").get() as { count: number };
    const facultyCount = db.prepare("SELECT COUNT(*) as count FROM faculty").get() as { count: number };
    const eventCount = db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    const resourceCount = db.prepare("SELECT COUNT(*) as count FROM resources").get() as { count: number };
    res.json({
      students: studentCount.count,
      faculty: facultyCount.count,
      events: eventCount.count,
      resources: resourceCount.count
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
