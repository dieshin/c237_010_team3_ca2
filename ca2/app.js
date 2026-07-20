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
    ssl: {
        rejectUnauthorized: false
    }
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
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

app.use(flash());

app.set('view engine', 'ejs');

// Check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }

    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};

// Check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }

    req.flash('error', 'Access denied');
    res.redirect('/dashboard');
};

// Validate registration
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;

    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }

    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    next();
};

// Home page
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user,
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

// Register page
app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

// Register user
app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact } = req.body;
    const role = 'user';

    const sql = `
        INSERT INTO users
        (username, email, password, address, contact, role)
        VALUES (?, ?, SHA1(?), ?, ?, ?)
    `;

    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            console.error('Registration error:', err);
            return res.send('Error registering user');
        }

        console.log('User registered:', result);

        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

// Login page
app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

// Login user
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const checkUserSql = 'SELECT * FROM users WHERE email = ?';

    db.query(checkUserSql, [email], (err, results) => {
        if (err) {
            console.error('Login error:', err);
            return res.send('Database error');
        }

        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = results[0];

        if (user.status === 'locked') {
            req.flash('error', 'Your account is locked due to multiple failed attempts.');
            return res.redirect('/login');
        }

        const sql = `
            SELECT *
            FROM users
            WHERE email = ?
            AND password = SHA1(?)
        `;

        db.query(sql, [email, password], (err, loginResults) => {
            if (err) {
                console.error('Password checking error:', err);
                return res.send('Database error');
            }

            if (loginResults.length > 0) {
                const resetSql = 'UPDATE users SET login_attempts = 0 WHERE email = ?';

                db.query(resetSql, [email], (err) => {
                    if (err) {
                        console.error('Reset login attempts error:', err);
                        return res.send('Database error');
                    }

                    req.session.user = loginResults[0];
                    req.flash('success', 'Login successful!');

                    if (loginResults[0].role === 'admin') {
                        res.redirect('/admin');
                    } else {
                        res.redirect('/dashboard');
                    }
                });
            } else {
                const newAttempts = user.login_attempts + 1;

                if (newAttempts >= 3) {
                    const lockSql = `
                        UPDATE users
                        SET login_attempts = ?, status = 'locked'
                        WHERE email = ?
                    `;

                    db.query(lockSql, [newAttempts, email], (err) => {
                        if (err) {
                            console.error('Account locking error:', err);
                            return res.send('Database error');
                        }

                        req.flash('error', 'Account locked. 3 failed login attempts exceeded.');
                        res.redirect('/login');
                    });
                } else {
                    const updateAttemptsSql = `
                        UPDATE users
                        SET login_attempts = ?
                        WHERE email = ?
                    `;

                    db.query(updateAttemptsSql, [newAttempts, email], (err) => {
                        if (err) {
                            console.error('Login attempts error:', err);
                            return res.send('Database error');
                        }

                        req.flash('error', 'Invalid email or password.');
                        res.redirect('/login');
                    });
                }
            }
        });
    });
});

// User dashboard
app.get('/dashboard', checkAuthenticated, (req, res) => {
    res.render('dashboard', {
        user: req.session.user
    });
});

// Admin dashboard
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('admin', {
        user: req.session.user
    });
});

// View, search, filter and sort workouts
app.get('/workouts', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const search = req.query.search || '';
    const muscleGroup = req.query.muscleGroup || '';
    const sort = req.query.sort || 'newest';

    let sql = `
        SELECT *
        FROM workouts
        WHERE userId = ?
    `;

    const values = [userId];

    // Search by workout title or exercise name
    if (search) {
        sql += `
            AND (
                exerciseName LIKE ?
                OR title LIKE ?
            )
        `;

        values.push(`%${search}%`);
        values.push(`%${search}%`);
    }

    // Filter by muscle group
    if (muscleGroup) {
        sql += ' AND muscleGroup = ?';
        values.push(muscleGroup);
    }

    // Sort workouts
    if (sort === 'oldest') {
        sql += ' ORDER BY workoutDate ASC';
    } else if (sort === 'heaviest') {
        sql += ' ORDER BY weight DESC';
    } else {
        sql += ' ORDER BY workoutDate DESC';
    }

    db.query(sql, values, (err, results) => {
        if (err) {
            console.error('Error retrieving workouts:', err);
            return res.send('Error retrieving workouts');
        }

        res.render('workouts', {
            workouts: results,
            user: req.session.user,
            search: search,
            muscleGroup: muscleGroup,
            sort: sort
        });
    });
});

// Add workout page
app.get('/workouts/add', checkAuthenticated, (req, res) => {
    res.render('addWorkout', {
        user: req.session.user,
        errors: req.flash('error'),
        success: req.flash('success')
    });
});

// Add workout
app.post('/workouts/add', checkAuthenticated, (req, res) => {
    const {
        title,
        muscleGroup,
        exerciseName,
        sets,
        reps,
        weight,
        restTime
    } = req.body;

    const userId = req.session.user.id;

    if (!title || !muscleGroup || !exerciseName || !sets || !reps || !weight || !restTime) {
        req.flash('error', 'All fields are required to log your workout.');
        return res.redirect('/workouts/add');
    }

    const sql = `
        INSERT INTO workouts
        (userId, title, muscleGroup, exerciseName, sets, reps, weight, restTime, workoutDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    db.query(
        sql,
        [userId, title, muscleGroup, exerciseName, sets, reps, weight, restTime],
        (err, result) => {
            if (err) {
                console.error('Error adding workout:', err);

                req.flash(
                    'error',
                    'Database error occurred while saving your workout.'
                );

                return res.redirect('/workouts/add');
            }

            console.log('Workout logged successfully:', result);

            req.flash('success', 'Workout successfully tracked!');
            res.redirect('/workouts/add');
        }
    );
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }

        res.redirect('/');
    });
});

// Edit user
app.get('/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = req.params.id;

    const sql = 'SELECT * FROM users WHERE id = ?';

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error retrieving user:', err);
            return res.send('Database error');
        }

        if (results.length === 0) {
            req.flash('error', 'User not found');
            return res.redirect('/admin');
        }

        res.render('edit', {
            user: results[0],
            messages: req.flash('error')
        });
    });
});

// Update user
app.post('/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = req.params.id;
    const { username, email, address, contact, role } = req.body;

    if (!username || !email || !address || !contact) {
        req.flash('error', 'All fields are required.');
        return res.redirect(`/edit/${userId}`);
    }

    const sql = `
        UPDATE users
        SET username = ?, email = ?, address = ?, contact = ?, role = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [username, email, address, contact, role, userId],
        (err, result) => {
            if (err) {
                console.error('Error updating user:', err);
                return res.send('Database error');
            }

            req.flash('success', 'User updated successfully!');
            res.redirect('/admin');
        }
    );
});

// Start server
app.listen(3000, () => {
    console.log('Server started on port http://localhost:3000');
});
