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
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'Access denied');
    res.redirect('/dashboard'); 
};



// =========================
// REGISTRATION VALIDATION
// =========================

const validateRegistration = (req, res, next) => {
    const {
        username,
        email,
        password,
        address,
        contact
    } = req.body;

    if (!username || !email || !password || !address || !contact) {
        return res.status(400).send('All fields are required.');
    }

    if (password.length < 6) {
        req.flash(
            'error',
            'Password should be at least 6 characters long'
        );

        req.flash('formData', req.body);

        return res.redirect('/register');
    }

    next();
};


// =========================
// HOME PAGE
// =========================

app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user,
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});


// =========================
// REGISTER
// =========================

app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

app.post('/register', validateRegistration, (req, res) => {

    const {
        username,
        email,
        password,
        address,
        contact,
        role // <--- 1. Pull role from req.body
    } = req.body;

    // 2. Fallback to 'user' if no role was selected
    const userRole = role || 'user'; 

    const sql = `
        INSERT INTO users
        (username, email, password, address, contact, role)
        VALUES (?, ?, SHA2(?,256), ?, ?, ?)
    `;

    db.query(
        sql,
        [
            username,
            email,
            password,
            address,
            contact,
            userRole // <--- 3. Pass userRole here
        ],
        (err) => {
            if (err) {
                console.error('Registration error:', err);
                return res.send('Error registering user');
            }

            req.flash('success', 'Registration successful! Please log in.');
            res.redirect('/login');
        }
    );
});

// =========================
// LOGIN
// =========================

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

    const checkUserSql = `
        SELECT *
        FROM users
        WHERE email = ?
    `;

    db.query(checkUserSql, [email], (err, results) => {

        if (err) {
            console.error(err);
            return res.send('Database error');
        }

        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = results[0];

        if (user.status === 'locked') {
            req.flash('error', 'Your account is locked.');
            return res.redirect('/login');
        }

        const loginSql = `
            SELECT *
            FROM users
            WHERE email = ?
            AND password = SHA2(?, 256)
        `;

        db.query(loginSql, [email, password], (err, loginResults) => {

            if (err) {
                console.error(err);
                return res.send('Database error');
            }

            if (loginResults.length > 0) {

                const loggedInUser = loginResults[0];

                db.query(
                    `UPDATE users SET login_attempts = 0 WHERE email = ?`,
                    [email]
                );

                req.session.user = loggedInUser;
                req.flash('success', 'Login successful!');

                if (loggedInUser.role === 'admin') {
                    return res.redirect('/admin');
                }

                return res.redirect('/dashboard');

            } else {

                const newAttempts = user.login_attempts + 1;

                if (newAttempts >= 3) {

                    db.query(
                        `UPDATE users SET login_attempts = ?, status = 'locked' WHERE email = ?`,
                        [newAttempts, email],
                        (err) => {
                            if (err) console.error(err);
                            req.flash('error', 'Account locked after 3 failed attempts.');
                            return res.redirect('/login');
                        }
                    );

                } else {

                    db.query(
                        `UPDATE users SET login_attempts = ? WHERE email = ?`,
                        [newAttempts, email],
                        (err) => {
                            if (err) console.error(err);
                            req.flash('error', 'Invalid email or password.');
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

app.get(
    '/dashboard',
    checkAuthenticated,
    (req, res) => {

        res.render(
            'dashboard',
            {
                user: req.session.user,
                streak: 5,
                weeklyProgress: [],
                personalBests: [],
            }
        );

    }
);


// =========================
// ADMIN PAGE
// =========================
app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    const lockedSql = "SELECT * FROM users WHERE status = 'locked'";
    const allWorkoutsSql = `
        SELECT workouts.*, users.username 
        FROM workouts 
        JOIN users ON workouts.userId = users.id OR workouts.userId = users.userId
        ORDER BY workoutDate DESC
    `;

    db.query(lockedSql, (err, lockedResults) => {
        if (err) return res.send('Database error');

        db.query(allWorkoutsSql, (err, workoutResults) => {
            if (err) {
                // If team member's column names differ, fall back safely
                db.query("SELECT * FROM workouts ORDER BY workoutDate DESC", (err2, fallbackWorkouts) => {
                    return res.render('admin', {
                        user: req.session.user,
                        lockedUsers: lockedResults || [],
                        workouts: fallbackWorkouts || [],
                        messages: req.flash('success'),
                        errors: req.flash('error')
                    });
                });
                return;
            }

            res.render('admin', {
                user: req.session.user,
                lockedUsers: lockedResults || [],
                workouts: workoutResults || [],
                messages: req.flash('success'),
                errors: req.flash('error')
            });
        });
    });
});

app.post('/admin/workout/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const workoutId = req.params.id;

    const sql = `DELETE FROM workouts WHERE workoutId = ?`;

    db.query(sql, [workoutId], (err) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Database error deleting workout.');
            return res.redirect('/admin');
        }

        req.flash('success', 'Workout deleted successfully.');
        res.redirect('/admin');
    });
});
// =========================
// UNLOCK USER ACCOUNT
// =========================

app.post(
    '/admin/unlock/:id',
    checkAuthenticated,
    checkAdmin,
    (req, res) => {

        const userId = req.params.id;

const sql = `
    UPDATE users
    SET login_attempts = 0, status = 'active'
    WHERE id = ? OR userId = ?
`;

        db.query(
            sql,
            [userId],
            (err) => {

                if (err) {
                    return res.send('Database error');
                }

                req.flash(
                    'success',
                    'Account unlocked successfully.'
                );

                res.redirect('/admin');
            }
        );

    }
);


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
        const userId = req.session.user.id || req.session.user.userId;
        const search = req.query.search || '';
        const muscleGroup = req.query.muscleGroup || '';
        const sort = req.query.sort || 'newest';

        let sql = `SELECT * FROM workouts WHERE userId = ?`;
        const values = [userId];

        if (search) {
            sql += ` AND (exerciseName LIKE ? OR title LIKE ?)`;
            values.push(`%${search}%`, `%${search}%`);
        }

        if (muscleGroup) {
            sql += ` AND muscleGroup = ?`;
            values.push(muscleGroup);
        }

        if (sort === 'oldest') {
            sql += ` ORDER BY workoutDate ASC`;
        } else if (sort === 'heaviest') {
            sql += ` ORDER BY weight DESC`;
        } else {
            sql += ` ORDER BY workoutDate DESC`;
        }

        db.query(sql, values, (err, results) => {
            if (err) {
                console.error('Error retrieving workouts:', err);
                return res.send('Error retrieving workouts');
            }

            res.render('workout', {
                workouts: results,
                user: req.session.user,
                search: search,
                muscleGroup: muscleGroup,
                sort: sort,
                messages: req.flash('success'),
                errors: req.flash('error')
            });
        });
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
// edit

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

app.get(
    '/logout',
    (req, res) => {
        req.session.destroy(
            (err) => {
                if (err) {
                    return res.send(
                        'Error logging out'
                    );
                }
                res.redirect('/login');
            }
        );
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