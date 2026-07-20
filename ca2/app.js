const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// Database connection
const db = mysql.createConnection({
    host: 'c237-meilan-mysql.mysql.database.azure.com',
    user: 'c237_010',
    password: 'c237010@2026!',
    database: 'c237_010_team3_ca2',
    ssl: { rejectUnauthorized: false }
});
   
db.connect((err) => {
    if (err) {
        console.error('Database connection error:', err);
        return;
    }
    console.log('Connected to database');
});

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());
app.set('view engine', 'ejs');

// Auth checks
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/dashboard');
};

// Registration validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;
    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user,
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

// Register
app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});
app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact } = req.body;
    const role = 'user';
    const sql = `
        INSERT INTO users (username, email, password, address, contact, role)
        VALUES (?, ?, SHA1(?), ?, ?, ?)
    `;
    db.query(sql, [username, email, password, address, contact, role], (err) => {
        if (err) {
            console.error('Registration error:', err);
            return res.send('Error registering user');
        }
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

// Login
app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }
    const checkUserSql = 'SELECT * FROM users WHERE email = ?';
    db.query(checkUserSql, [email], (err, results) => {
        if (err) return res.send('Database error');
        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }
        const user = results[0];
        if (user.status === 'locked') {
            req.flash('error', 'Your account is locked.');
            return res.redirect('/login');
        }
        const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
        db.query(sql, [email, password], (err, loginResults) => {
            if (err) return res.send('Database error');
            if (loginResults.length > 0) {
                db.query('UPDATE users SET login_attempts = 0 WHERE email = ?', [email]);
                req.session.user = loginResults[0];
                req.flash('success', 'Login successful!');
                return loginResults[0].role === 'admin' ? res.redirect('/admin') : res.redirect('/dashboard');
            } else {
                const newAttempts = user.login_attempts + 1;
                if (newAttempts >= 3) {
                    db.query('UPDATE users SET login_attempts = ?, status = "locked" WHERE email = ?', [newAttempts, email]);
                    req.flash('error', 'Account locked after 3 failed attempts.');
                } else {
                    db.query('UPDATE users SET login_attempts = ? WHERE email = ?', [newAttempts, email]);
                    req.flash('error', 'Invalid email or password.');
                }
                res.redirect('/login');
            }
        });
    });
});

// Dashboards
app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = "SELECT * FROM users WHERE status = 'locked'";
    db.query(sql, (err, results) => {
        if (err) return res.send('Database error');
        res.render('admin', {
            user: req.session.user,
            lockedUsers: results,
            messages: req.flash('success')
        });
    });
});
app.post('/admin/unlock/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = req.params.id;
    db.query('UPDATE users SET login_attempts = 0, status = "active" WHERE id = ?', [userId], (err) => {
        if (err) return res.send('Database error');
        req.flash('success', 'Account unlocked.');
        res.redirect('/admin');
    });
});

// Workouts
app.get('/workout', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const search = req.query.search || '';
    const muscleGroup = req.query.muscleGroup || '';
    const sort = req.query.sort || 'newest';
    let sql = 'SELECT * FROM workouts WHERE userId = ?';
    const values = [userId];
    if (search) {
        sql += ' AND (exerciseName LIKE ? OR title LIKE ?)';
        values.push(`%${search}%`, `%${search}%`);
    }
    if (muscleGroup) {
        sql += ' AND muscleGroup = ?';
        values.push(muscleGroup);
    }
    if (sort === 'oldest') sql += ' ORDER BY workoutDate ASC';
    else if (sort === 'heaviest') sql += ' ORDER BY weight DESC';
    else sql += ' ORDER BY workoutDate DESC';
    db.query(sql, values, (err, results) => {
        if (err) return res.send('Error retrieving workouts');
        res.render('workouts', {
            workouts: results,
            user: req.session.user,
            search,
            muscleGroup,
            sort
        });
    });
});
app.get('/workout/add', checkAuthenticated, (req, res) => {
    res.render('addWorkout', {
        user: req.session.user,
        errors: req.flash('error'),
        success: req.flash('success')
    });
});
app.post('/workout/add', checkAuthenticated, (req, res) => {
    const { title, muscleGroup, exerciseName, sets, reps, weight, restTime, notes } = req.body;
    const userId = req.session.user.id;
    if (!title || !muscleGroup || !exerciseName || !sets || !reps || !weight || !restTime) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/workout/add');
    }
    const sql = `
        INSERT INTO workouts (userId, title, muscleGroup, exerciseName, sets, reps, weight, restTime, workoutDate, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `;
    db.query(sql, [userId, title, muscleGroup, exerciseName, sets, reps, weight, restTime, notes], (err) => {
        if (err) {
            req.flash('error', 'Database error saving workout.');
            return res.redirect('/workout/add');
        }
        req.flash('success', 'Workout successfully tracked!');
        res.redirect('/workout');
    });
});
app.post('/workout/delete/:id', checkAuthenticated, (req, res) => {
    const workoutId = req.params.id;
    const userId = req.session.user.id;
    db.query('DELETE FROM workouts WHERE workoutId = ? AND userId = ?', [workoutId, userId], (err, result) => {
        if (err) {
            req.flash('error', 'Database error deleting workout.');
            return res.redirect('/workout');
        }
        req.flash('success', 'Workout deleted successfully.');
        res.redirect('/workout');
    });
});
// Start server
app.listen(3000, () => {
    console.log('Server started on port http://localhost:3000');
});
