require('dotenv').config()
const path = require('path');
const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

// Global announcement 
let globalAnnouncement = "Welcome to Anytime Gym!";

// logs
let systemLogs = [
    { timestamp: new Date().toLocaleString(), action: 'Website started up successfully' }
];

function logActivity(action) {
    systemLogs.unshift({ timestamp: new Date().toLocaleString(), action });
    if (systemLogs.length > 50) systemLogs.pop(); 
}

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
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

const admin_key = process.env.ADMIN_KEY;

app.use(session({
    secret: process.env.SESSION || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(flash());
app.set('view engine', 'ejs');

// Global middlware
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.messages = req.flash('success');
    res.locals.errors = req.flash('error');
    res.locals.search = req.query.search || '';
    res.locals.globalAnnouncement = globalAnnouncement;
    next();
});

// =========================
// AUTHENTICATION MIDDLEWARES
// =========================
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in again.');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role && req.session.user.role.toLowerCase().trim() === 'admin') {
        return next();
    }
    req.flash('error', 'Access denied. You are not an admin.');
    res.redirect('/dashboard');
};

const checkMember = (req, res, next) => {
    const role = req.session.user && req.session.user.role ? req.session.user.role.toLowerCase().trim() : '';
    if (role === 'member' || role === 'admin') {
        return next();
    }
    req.flash('error', 'Upgrade to a member to access this.');
    res.redirect('/upgrade');
};

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
app.get('/', (req, res) => res.render('index'));
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
    if (securityCode === admin_key) assignedRole = 'admin';
    else if (securityCode === member_key) assignedRole = 'member';

    const sql = `
        INSERT INTO users (username, email, password, address, contact, role, login_attempts, status)
        VALUES (?, ?, LOWER(SHA2(?,256)), ?, ?, ?, 0, 'active')
    `;

    db.query(sql, [username, email, password, address, contact, assignedRole], (err) => {
        if (err) {
            req.flash('error', 'Database error during registration.');
            return res.redirect('/register');
        }
        logActivity(`New account registered: ${username} (${assignedRole.toUpperCase()})`);
        req.flash('success', `Account created as [${assignedRole.toUpperCase()}]! Please log in.`);
        res.redirect('/login');
    });
});
// =========================
// LOGIN
// =========================

app.get('/login', (req, res) => res.render('login'));

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    db.query(`SELECT * FROM users WHERE email = ?`, [email], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = results[0];

        // Check if user is banned
if (user.status === 'banned') {
    req.flash('error', 'Your account has been banned by an administrator.');
    return res.redirect('/login');
}

        // Check if user is locked
        if (user.status === 'locked' || user.login_attempts >= 3) {
            req.flash('error', 'Your account is locked. Contact Admin.');
            return res.redirect('/login');
        }

        const loginSql = `SELECT * FROM users WHERE email = ? AND password = LOWER(SHA2(?, 256))`;
        db.query(loginSql, [email, password], (err, loginResults) => {
            if (loginResults && loginResults.length > 0) {
                const loggedInUser = loginResults[0];
                db.query(`UPDATE users SET login_attempts = 0 WHERE email = ?`, [email]);
                
                req.session.user = loggedInUser;
                logActivity(`User logged in: ${loggedInUser.username}`);
                req.flash('success', 'Login successful!');

                if (loggedInUser.role && loggedInUser.role.toLowerCase().trim() === 'admin') {
                    return res.redirect('/admin');
                }
                return res.redirect('/dashboard');
            } else {
                const newAttempts = (user.login_attempts || 0) + 1;
                const updateStatus = newAttempts >= 3 ? 'locked' : 'active';
                db.query(`UPDATE users SET login_attempts = ?, status = ? WHERE email = ?`, [newAttempts, updateStatus, email], () => {
                    if (newAttempts >= 3) {
                        logActivity(`Account locked due to 3 failed attempts: ${email}`);
                        req.flash('error', 'Account locked after 3 failed login attempts.');
                    } else {
                        req.flash('error', `Invalid credentials. Attempts left: ${3 - newAttempts}`);
                    }
                    res.redirect('/login');
                });
            }
        });
    });
});

// =========================
// USER DASHBOARD
// =========================
app.get('/dashboard', checkAuthenticated, (req, res) => {

    const userId = req.session.user.id || req.session.user.userId;

    // =========================================
    // 1. GET PERSONAL BESTS
    // =========================================
    const personalBestSql = `
        SELECT
            exerciseName,
            MAX(weight) AS personalBest
        FROM workouts
        WHERE userId = ?
        GROUP BY exerciseName
        ORDER BY exerciseName ASC
    `;

    // =========================================
    // 2. GET WORKOUT DAYS FOR STREAK
    // =========================================
    const streakSql = `
        SELECT DISTINCT workoutDate
        FROM workouts
        WHERE userId = ?
        ORDER BY workoutDate DESC
    `;

    // =========================================
    // 3. GET THIS WEEK'S WORKOUT PROGRESS
    // =========================================
    const weeklyProgressSql = `
        SELECT
            DAYNAME(workoutDate) AS day,
            COUNT(DISTINCT workoutDate) AS workoutCount
        FROM workouts
        WHERE userId = ?
        AND workoutDate >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        GROUP BY workoutDate, DAYNAME(workoutDate)
        ORDER BY workoutDate ASC
    `;

    db.query(personalBestSql, [userId], (pbErr, pbResults) => {

        if (pbErr) {
            console.error('Error loading personal bests:', pbErr);
            return res.send('Error loading dashboard data.');
        }

        db.query(streakSql, [userId], (streakErr, streakResults) => {

            if (streakErr) {
                console.error('Error loading workout streak:', streakErr);
                return res.send('Error loading dashboard data.');
            }

            db.query(weeklyProgressSql, [userId], (weeklyErr, weeklyResults) => {

                if (weeklyErr) {
                    console.error('Error loading weekly progress:', weeklyErr);
                    return res.send('Error loading dashboard data.');
                }

                // =========================================
                // CALCULATE CURRENT CONSECUTIVE STREAK
                // =========================================

                let streak = 0;

                if (streakResults.length > 0) {

                    // Convert database dates into YYYY-MM-DD strings
                    const workoutDates = streakResults.map(workout => {

                        const date = new Date(workout.workoutDate);

                        return date.toISOString().split('T')[0];

                    });

                    // Remove duplicates and sort newest first
                    const uniqueDates = [...new Set(workoutDates)].sort().reverse();

                    // Get today's date
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const todayString = today.toISOString().split('T')[0];

                    // Get yesterday's date
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);

                    const yesterdayString = yesterday.toISOString().split('T')[0];

                    /*
                        A streak is considered active if the user worked out:
                        - Today
                        OR
                        - Yesterday

                        This prevents the streak from immediately becoming 0
                        if the user has not worked out yet today.
                    */

                    if (
                        uniqueDates[0] === todayString ||
                        uniqueDates[0] === yesterdayString
                    ) {

                        streak = 1;

                        for (let i = 0; i < uniqueDates.length - 1; i++) {

                            const currentDate = new Date(uniqueDates[i]);
                            const previousDate = new Date(uniqueDates[i + 1]);

                            const differenceInDays =
                                (currentDate - previousDate) /
                                (1000 * 60 * 60 * 24);

                            if (differenceInDays === 1) {
                                streak++;
                            } else {
                                break;
                            }
                        }
                    }
                }

                // =========================================
                // SEND DATA TO DASHBOARD
                // =========================================

                res.render('dashboard', {

                    streak: streak,

                    weeklyProgress: weeklyResults || [],

                    personalBests: pbResults || []

                });

            });

        });

    });

});
//membership
app.get('/upgrade', checkAuthenticated, (req, res) => res.render('upgrade'));

app.post('/upgrade', checkAuthenticated, (req, res) => {
    const { cardNumber, expiry, cvv, cardHolder } = req.body;
    const userId = req.session.user.id || req.session.user.userId;

    if (!cardNumber || !expiry || !cvv || !cardHolder) {
        req.flash('error', 'Please fill in all payment details.');
        return res.redirect('/upgrade');
    }

    db.query(`UPDATE users SET role = 'member' WHERE id = ?`, [userId], (err) => {
        if (err) {
            req.flash('error', 'Payment processed but database update failed.');
            return res.redirect('/upgrade');
        }

        req.session.user.role = 'member';
        logActivity(`User upgraded to VIP Member: ${req.session.user.username}`);
        req.flash('success', ' Payment successful! Welcome');
        res.redirect('/dashboard');
    });
});

app.get('/workout/analytics', checkAuthenticated, checkMember, (req, res) => {
    const userId = req.session.user.id || req.session.user.userId;

    const maxWeightSql = `SELECT MAX(weight) AS max1RM FROM workouts WHERE userId = ?`;
    
    const distributionSql = `
        SELECT 
            muscleGroup AS category, 
            ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM workouts WHERE userId = ?)), 0) AS percentage
        FROM workouts 
        WHERE userId = ?
        GROUP BY muscleGroup
    `;

    db.query(maxWeightSql, [userId], (err, maxResults) => {
        if (err) return res.send('Error fetching analytics.');

        db.query(distributionSql, [userId, userId], (err, distResults) => {
            if (err) return res.send('Error fetching analytics.');

            const max1RM = maxResults[0]?.max1RM || null;
            const muscleDistribution = distResults || [];

            res.render('memberAnalytics', {
                user: req.session.user,
                max1RM: max1RM,
                monthIncrease: null, 
                muscleDistribution: muscleDistribution
            });
        });
    });
});
// =========================
// ADMIN ROUTES
// =========================
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    const userCountSql = "SELECT COUNT(*) AS totalUsers FROM users";
    const workoutCountSql = "SELECT COUNT(*) AS totalWorkouts FROM workouts";

    db.query(userCountSql, (err, userResults) => {
        db.query(workoutCountSql, (err, countResults) => {
            res.render('adminOverview', {
                logs: systemLogs,
                stats: {
                    totalUsers: userResults ? userResults[0].totalUsers : 0,
                    totalWorkouts: countResults ? countResults[0].totalWorkouts : 0
                }
            });
        });
    });
});

app.get('/admin/users', checkAuthenticated, checkAdmin, (req, res) => {
    db.query("SELECT * FROM users", (err, userResults) => {
        if (err) return res.send('Database error loading users.');
        res.render('adminUsers', { allUsers: userResults || [] });
    });
});

app.post('/admin/announcement', checkAuthenticated, checkAdmin, (req, res) => {
    if (req.body.announcement) {
        globalAnnouncement = req.body.announcement;
        logActivity(`Admin (${req.session.user.username}) posted global announcement: "${globalAnnouncement}"`);
        req.flash('success', 'Global announcement updated successfully.');
    }
    res.redirect('/admin');
});

app.post('/admin/unlock/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = req.params.id;
    db.query(`UPDATE users SET login_attempts = 0, status = 'active' WHERE id = ?`, [userId], (err) => {
        logActivity(`Admin unlocked user ID #${userId}`);
        req.flash('success', 'Account unlocked successfully.');
        res.redirect('/admin/users');
    });
});
app.post('/admin/ban/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = req.params.id;

    db.query("SELECT username, status FROM users WHERE id = ?", [userId], (err, results) => {
        if (err || results.length === 0) {
            req.flash('error', 'User not found.');
            return res.redirect('/admin/users');
        }

        const user = results[0];
        // If currently 'banned', change to 'active'. Otherwise, set to 'banned'.
        const newStatus = (user.status === 'banned') ? 'active' : 'banned';

        // Save new status to database
        db.query("UPDATE users SET status = ? WHERE id = ?", [newStatus, userId], (err) => {
            if (err) {
                console.error("Ban Query Error:", err);
                req.flash('error', 'Failed to update user status.');
                return res.redirect('/admin/users');
            }

            const actionText = (newStatus === 'banned') ? 'banned' : 'unbanned';
            logActivity(`Admin ${actionText} user "${user.username}" (ID #${userId})`);

            req.flash('success', `User "${user.username}" was successfully ${actionText}.`);
            res.redirect('/admin/users');
        });
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
            user: results[0],
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
// ACCOUNT PAGE
// =========================
app.get('/account', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const sql = `
        SELECT id, username, email, address, contact, role
        FROM users
        WHERE id = ?
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Account page error:', err);
            return res.status(500).send('Database error');
        }

        if (results.length === 0) {
            return res.status(404).send('User not found');
        }

        res.render('account', {
    profile: results[0],
    messages: req.flash('success')
});
    });
});
// =========================
// UPDATE ACCOUNT
// =========================

app.post('/account', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const {
        username,
        email,
        address,
        contact
    } = req.body;

    if (!username || !email) {
        req.flash('error', 'Username and email are required.');
        return res.redirect('/account');
    }

    const sql = `
        UPDATE users
        SET username = ?,
            email = ?,
            address = ?,
            contact = ?
        WHERE id = ?
    `;

    db.query(
        sql,
        [username, email, address, contact, userId],
        (err) => {
            if (err) {
                console.error('Account update error:', err);
                req.flash('error', 'Unable to update account.');
                return res.redirect('/account');
            }

            req.session.user.username = username;
            req.session.user.email = email;
            req.session.user.address = address;
            req.session.user.contact = contact;

            req.flash('success', 'Profile updated successfully.');
            res.redirect('/account');
        }
    );
});
// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// START SERVER
app.listen(3000, () => console.log('Server started on http://localhost:3000'));
