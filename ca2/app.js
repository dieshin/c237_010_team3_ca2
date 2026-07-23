const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

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

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));
app.use(express.json());
const admin_key = process.env.admin_key || 'realadmin5106';
const member_key = process.env.member_key|| 'azuree24';
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

app.use(flash());

app.set('view engine', 'ejs');

//global
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.messages = req.flash('success');
    res.locals.errors = req.flash('error');
    res.locals.success = res.locals.messages;
    res.locals.search = req.query.search || ''; 
    next();
});
// =========================
// AUTHENTICATION MIDDLEWARE
// =========================

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }

    req.flash('error', 'Please log in again');
    res.redirect('/login');
};
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role.toLowerCase().trim() === 'admin') {
        return next();
    }
    req.flash('error', 'Access denied.');
    res.redirect('/dashboard'); 
};


// =========================
// REGISTRATION VALIDATION
// =========================
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;

    if (!username || !email || !password || !address || !contact) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 characters long.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    next();
};

// =========================
// HOME PAGE
// =========================

app.get('/', (req, res) => {
    res.render('index');
});
// =========================
// REGISTER
// =========================

app.get('/register', (req, res) => {
    const formData = req.flash('formData')[0] || {};
    res.render('register', { formData });
});
app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, securityCode } = req.body;

    let assignedRole = 'user';
    if (securityCode === admin_key) {
        assignedRole = 'admin';
    } else if (securityCode === member_key) {
        assignedRole = 'member';
    }

    const sql = `
        INSERT INTO users (username, email, password, address, contact, role, login_attempts, status)
        VALUES (?, ?, LOWER(SHA2(?,256)), ?, ?, ?, 0, 'active')
    `;

    db.query(sql, [username, email, password, address, contact, assignedRole], (err) => {
        if (err) {
            console.error('Registration error:', err);
            req.flash('error', 'Database error during registration.');
            return res.redirect('/register');
        }

        req.flash('success', `Account created successfully as [${assignedRole.toUpperCase()}]! Please log in.`);
        res.redirect('/login');
    });
});

// =========================
// LOGIN
// =========================
app.get('/login', (req, res) => {
    res.render('login');
});
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const checkUserSql = `SELECT * FROM users WHERE email = ?`;

    db.query(checkUserSql, [email], (err, results) => {
        if (err) {
            console.error('Login Error:', err);
            req.flash('error', 'Database error during login.');
            return res.redirect('/login');
        }

        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = results[0];

        if (user.status === 'locked') {
            req.flash('error', 'Your account is locked due to 3 failed attempts. Contact Admin.');
            return res.redirect('/login');
        }

        const loginSql = `
            SELECT * FROM users 
            WHERE email = ? AND password = LOWER(SHA2(?, 256))
        `;

        db.query(loginSql, [email, password], (err, loginResults) => {
            if (err) {
                console.error('Password match error:', err);
                req.flash('error', 'Database error.');
                return res.redirect('/login');
            }

            if (loginResults.length > 0) {
                const loggedInUser = loginResults[0];

                // Reset failed attempts on success
                db.query(`UPDATE users SET login_attempts = 0 WHERE email = ?`, [email]);

                req.session.user = loggedInUser;
                req.flash('success', 'Login successful!');

                if (loggedInUser.role && loggedInUser.role.toLowerCase().trim() === 'admin') {
                    return res.redirect('/admin');
                }
                return res.redirect('/dashboard');

            } else {
                const newAttempts = (user.login_attempts || 0) + 1;

                if (newAttempts >= 3) {
                    db.query(
                        `UPDATE users SET login_attempts = ?, status = 'locked' WHERE email = ?`,
                        [newAttempts, email],
                        () => {
                            req.flash('error', 'Account locked after 3 failed login attempts.');
                            return res.redirect('/login');
                        }
                    );
                } else {
                    db.query(
                        `UPDATE users SET login_attempts = ? WHERE email = ?`,
                        [newAttempts, email],
                        () => {
                            req.flash('error', `Invalid email or password. Attempts left: ${3 - newAttempts}`);
                            return res.redirect('/login');
                        }
                    );
                }
            }
        });
    });
});

// =========================
// USER DASHBOARD
// =========================
app.get('/dashboard', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id || req.session.user.userId;

    const sql = `SELECT exerciseName, MAX(weight) as personalBest FROM workouts WHERE userId = ? GROUP BY exerciseName`;

    db.query(sql, [userId], (err, pbResults) => {
        res.render('dashboard', {
            streak: 5,
            weeklyProgress: [],
            personalBests: pbResults || []
        });
    });
});

//member w fake payment
app.get('/upgrade', checkAuthenticated, (req, res) => {
    res.render('upgrade');
});

app.post('/upgrade', checkAuthenticated, (req, res) => {
    const { cardNumber, expiry, cvv, cardHolder } = req.body;
    const userId = req.session.user.id || req.session.user.userId;

    if (!cardNumber || !expiry || !cvv || !cardHolder) {
        req.flash('error', 'Please fill in all payment details.');
        return res.redirect('/upgrade');
    }
    const sql = `UPDATE users SET role = 'member' WHERE id = ?`;

    db.query(sql, [userId], (err) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Payment processed but database update failed.');
            return res.redirect('/upgrade');
        }

        req.session.user.role = 'member';
        req.flash('success', 'Payment successful! Welcome to VIP Membership.');
        res.redirect('/dashboard');
    });
});
//view acc
app.get('/account', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id || req.session.user.userId;
    
    const sql = `SELECT id, username, email, address, contact, role, status FROM users WHERE id = ?`;
    db.query(sql, [userId], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'Unable to load profile data.');
            return res.redirect('/dashboard');
        }
        res.render('account', { profile: results[0] });
    });
});
// =========================
// ADMIN PAGE
// =========================
 app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    const lockedSql = "SELECT * FROM users WHERE status = 'locked'";
    const allWorkoutsSql = `
        SELECT workouts.*, users.username 
        FROM workouts 
        JOIN users ON workouts.userId = users.id
        ORDER BY workoutDate DESC
    `;

    db.query(lockedSql, (err, lockedResults) => {
        if (err) return res.send('Database error');

        db.query(allWorkoutsSql, (err, workoutResults) => {
            res.render('admin', {
                lockedUsers: lockedResults || [],
                workouts: workoutResults || []
            });
        });
    });
});

app.post('/admin/unlock/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = req.params.id;
    const sql = `UPDATE users SET login_attempts = 0, status = 'active' WHERE id = ?`;

    db.query(sql, [userId], (err) => {
        if (err) return res.send('Database error');
        req.flash('success', 'Account unlocked successfully.');
        res.redirect('/admin');
    });
});

app.post('/admin/workout/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const workoutId = req.params.id;
    const sql = `DELETE FROM workouts WHERE workoutId = ?`;

    db.query(sql, [workoutId], (err) => {
        if (err) {
            req.flash('error', 'Database error deleting workout.');
            return res.redirect('/admin');
        }
        req.flash('success', 'Workout deleted successfully.');
        res.redirect('/admin');
    });
});

// =========================
// PART D + PART F
// VIEW WORKOUTS
// SEARCH
// FILTER
// ORGANISE
// =========================
 
app.get(
    '/workout',
    checkAuthenticated,
    (req, res) => {

        const userId = req.session.user.id;

        const search =
            req.query.search || '';

        const muscleGroup =
            req.query.muscleGroup || '';

        const sort =
            req.query.sort || 'newest';

        let sql = `
            SELECT *
            FROM workouts
            WHERE userId = ?
        `;

        const values = [userId];


        // SEARCH BY TITLE OR EXERCISE NAME

        if (search) {

            sql += `
                AND (
                    exerciseName LIKE ?
                    OR title LIKE ?
                )
            `;

            values.push(
                `%${search}%`,
                `%${search}%`
            );
        }


        // FILTER BY MUSCLE GROUP

        if (muscleGroup) {

            sql += `
                AND muscleGroup = ?
            `;

            values.push(muscleGroup);
        }


        // ORGANISE / SORT RESULTS

        if (sort === 'oldest') {

            sql += `
                ORDER BY workoutDate ASC
            `;

        } else if (sort === 'heaviest') {

            sql += `
                ORDER BY weight DESC
            `;

        } else {

            sql += `
                ORDER BY workoutDate DESC
            `;
        }


        db.query(
            sql,
            values,
            (err, results) => {

                if (err) {

                    console.error(
                        'Error retrieving workouts:',
                        err
                    );

                    return res.send(
                        'Error retrieving workouts'
                    );
                }

                res.render(
                    'workout',
                    {
                        workouts: results,
                        user: req.session.user,
                        search: search,
                        muscleGroup: muscleGroup,
                        sort: sort
                    }
                );

            }
        );

    }
);

// =========================
// ADD WORKOUT PAGE
// =========================
app.get('/workout/add', checkAuthenticated, (req, res) => {
    res.render('addWorkout', {
        user: req.session.user,
        errors: req.flash('error'),
        messages: req.flash('success')
    });
});
app.post('/workout/add', checkAuthenticated, (req, res) => {
    const {
        title,
        muscleGroup,
        exerciseName,
        sets,
        reps,
        weight,
        restTime,
        notes = '' 
    } = req.body;

    const userId = req.session.user.id || req.session.user.userId;

    if (!title || !muscleGroup || !exerciseName || !sets || !reps || !weight || !restTime) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/workout/add');
    }

    const sql = `
        INSERT INTO workouts
        (userId, title, muscleGroup, exerciseName, sets, reps, weight, restTime, workoutDate, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `;

    db.query(
        sql,
        [userId, title, muscleGroup, exerciseName, sets, reps, weight, restTime, notes],
        (err) => {
            if (err) {
                console.error('Error saving workout:', err);
                req.flash('error', 'Database error saving workout.');
                return res.redirect('/workout/add');
            }

            req.flash('success', 'Workout successfully tracked!');
            res.redirect('/workout');
        }
    );
});

// edit workout

app.get(
    '/workout/edit/:id',
    checkAuthenticated,
    (req, res) => {

        const workoutId =
            req.params.id;

        const userId =
            req.session.user.id;

        const sql = `
            SELECT *
            FROM workouts
            WHERE workoutId = ?
            AND userId = ?
        `;

        db.query(
            sql,
            [
                workoutId,
                userId
            ],
            (err, results) => {

                if (err) {

                    console.error(err);

                    req.flash(
                        'error',
                        'Database error fetching workout.'
                    );

                    return res.redirect(
                        '/workout'
                    );
                }

                if (results.length === 0) {

                    req.flash(
                        'error',
                        'Workout not found.'
                    );

                    return res.redirect(
                        '/workout'
                    );
                }

                res.render(
                    'editWorkout',
                    {
                        user:
                            req.session.user,

                        workout:
                            results[0],

                        errors:
                            req.flash('error')
                    }
                );
            }
        );
    }
);

app.post(
    '/workout/edit/:id',
    checkAuthenticated,
    (req, res) => {

        const workoutId =
            req.params.id;

        const userId =
            req.session.user.id;

        const {
            title,
            muscleGroup,
            exerciseName,
            sets,
            reps,
            weight,
            restTime,
            notes
        } = req.body;

        if (!title || !muscleGroup || !exerciseName || !sets || !reps || !weight || !restTime) {
            req.flash('error', 'All fields are required.');
            return res.redirect(`/workout/edit/${workoutId}`);
        }

        const sql = `
            UPDATE workouts
            SET
                title = ?,
                muscleGroup = ?,
                exerciseName = ?,
                sets = ?,
                reps = ?,
                weight = ?,
                restTime = ?,
                notes = ?
            WHERE workoutId = ?
            AND userId = ?
        `;

        db.query(
            sql,
            [
                title,
                muscleGroup,
                exerciseName,
                sets,
                reps,
                weight,
                restTime,
                notes,
                workoutId,
                userId
            ],
            (err) => {

                if (err) {

                    console.error(err);

                    req.flash(
                        'error',
                        'Database error updating workout.'
                    );

                    return res.redirect(
                        `/workout/edit/${workoutId}`
                    );
                }

                req.flash(
                    'success',
                    'Workout updated successfully!'
                );

                res.redirect(
                    '/workout'
                );
            }
        );
    }
);

// =========================
// EDIT ACCOUNT
// =========================

app.get('/edit', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id || req.session.user.userId;

    const sql = `SELECT id, username, email, address, contact FROM users WHERE id = ?`;

    db.query(sql, [userId], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'Unable to load profile data.');
            return res.redirect('/account');
        }

        res.render('edit', {
            profile: results[0],
            errors: req.flash('error')
        });
    });
});

app.post('/edit', checkAuthenticated, (req, res) => {
    const { username, email, address, contact } = req.body;
    const userId = req.session.user.id || req.session.user.userId;

    if (!username || !email || !address || !contact) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/edit');
    }

    const sql = `
        UPDATE users
        SET username = ?, email = ?, address = ?, contact = ?
        WHERE id = ?
    `;

    db.query(sql, [username, email, address, contact, userId], (err) => {
        if (err) {
            console.error('Account update error:', err);
            req.flash('error', 'Database error updating profile.');
            return res.redirect('/edit');
        }

        req.session.user.username = username;
        req.session.user.email = email;
        req.session.user.address = address;
        req.session.user.contact = contact;

        req.flash('success', 'Profile updated successfully!');
        res.redirect('/account');
    });
});

// =========================
// DELETE WORKOUT
// =========================

app.post(
    '/workout/delete/:id',
    checkAuthenticated,
    (req, res) => {
        const workoutId = req.params.id;
        const userId = req.session.user.id || req.session.user.userId;

        const sql = `
            DELETE FROM workouts
            WHERE workoutId = ?
            AND userId = ?
        `;

        db.query(
            sql,
            [
                workoutId,
                userId
            ],
            (err) => {
                if (err) {
                    req.flash(
                        'error',
                        'Database error deleting workout.'
                    );
                    return res.redirect(
                        '/workout'
                    );
                }

                req.flash(
                    'success',
                    'Workout deleted successfully.'
                );

                res.redirect('/workout');
            }
        );
    }
);

// =========================
// LOGOUT
// =========================
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.send('Error logging out');
        res.redirect('/');
    });
});
// =========================
// START SERVER
// =========================

app.listen(
    3000,
    () => {
        console.log(
            'Server started on port http://localhost:3000'
        );
    }
);
