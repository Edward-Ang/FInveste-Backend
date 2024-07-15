const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const saltRounds = 10;
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bosyParser = require('body-parser');
const session = require('express-session');

const port = 5000;
const app = express();

app.use(cors({
    origin: 'http://finveste.s3-website-ap-southeast-1.amazonaws.com',
    credentials: true,
    methods: ["POST", "GET"]
}));
// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());
app.use(bosyParser.json());
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

mongoose.connect('mongodb+srv://weihenang02:WeiHen1211@finvestecluster.psbsm8y.mongodb.net/FInveste')
    .then(() => {
        console.log('MongoDB connected');
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error);
    });

// Define User model
const userSchema = new mongoose.Schema({
    username: String,
    password: String
});

const stockSchema = new mongoose.Schema({
    _id: mongoose.Schema.Types.ObjectId,
    Book: Number,
    '#': Number,
    Stock: String,
    Name: String,
    Open: Number,
    High: Number,
    Low: Number,
    Close: Number,
    MA: Number,
    EMA: Number,
    RSI: Number,
    Rating: String,
    RatingNo: Number
});

const watchlistSchema = new mongoose.Schema({
    name: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    userId: { type: String, required: true },
});

const Stock = mongoose.model('Stock', stockSchema);

const User = mongoose.model('User', userSchema);

const Watchlist = mongoose.model('Watchlist', watchlistSchema);

const Default = mongoose.model('Defaults', stockSchema);

app.get('/', (req, res) => {
    const sessionData = req.session;

    // Access or modify the session data here
    console.log(sessionData.username);

    // Save the session data after accessing or modifying it
    req.session.save((err) => {
        if (err) {
            console.error('Error saving session:', err);
        } else {
            console.log('Session saved');
        }
    });
});

app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;

        const hashpass = await bcrypt.hashSync(password, saltRounds);

        // Create a new user document
        const newUser = new User({ username, password: hashpass });

        // Save the user document to the database
        await newUser.save();

        const userId = newUser._id;
        // Create Watchlist model with dynamic collection name
        const UserStockModel = createWatchlistModel(userId);

        const stocks = await Stock.find({}, { _id: 0 });
        // Insert each stock from filteredStocks into the WatchlistModel collection
        const insertedStocks = await UserStockModel.insertMany(stocks);

        console.log(`Inserted ${insertedStocks.length} stocks into collection ${UserStockModel.collection.name}`);

        // Respond with a success message
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        // Handle errors
        console.error('Error creating user:', error);
        res.status(500).json({ message: 'Failed to create user' });
    }
});

app.get('/api/check_cookie', (req, res) => {
    if ('remember_me' in req.cookies) {
        res.send('The remember_me cookie is set.');
    } else {
        res.send('The remember_me cookie is not set.');
    }
});

app.get('/get-session', (req, res) => {
    if (req.session.username) {
        console.log('Current User: ', req.session.username);
        res.json({ valid: true, username: req.session.username });
    } else {
        res.json({ valid: false });
    }
});

// login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { username, password, checked } = req.body;

        const user = await User.findOne({ username });

        if (user) {
            // User found, handle accordingly
            console.log('User found:', user);

            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.username = username;
                req.session.userid = user._id;

                if (checked) {
                    // Set the remember_me cookie to expire in 30 days
                    res.cookie('remember_me', 'true', { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
                    // Set a non-httpOnly cookie for client-side checks
                    res.cookie('remember_me_client', 'true', { maxAge: 30 * 24 * 60 * 60 * 1000 });
                } else {
                    // Clear the remember_me cookies if they exist
                    res.clearCookie('remember_me');
                    res.clearCookie('remember_me_client');
                }

                res.json({ message: 'success', curUser: req.session.username });
            }
            else {
                console.log("Credentials Not Match");
                res.json({ message: 'Invalid Credentials' });
            }
        } else {
            // User not found, handle accordingly
            console.log('User not found');
            res.status(401).json({ message: 'User not found' });
        }
    }
    catch (error) {
        // Error occurred, handle accordingly
        console.error('Error finding user:', error);
        res.status(500).json({ message: 'Failed to find user' });
    }
});

app.get('/api/logout', async (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
            res.status(500).send('Error logging out');
        } else {
            res.clearCookie('remember_me');
            res.clearCookie('remember_me_client');
            console.log('Session destroyed');
            res.json({ message: 'Logged out' }); // or wherever you want to redirect after logout
        }
    });
});

app.get('/api/get_main', async (req, res) => {

    try {
        const userId = req.session.userid;

        if (userId) {
            const UserScreenModel = createWatchlistModel(userId);
            const stocks = await UserScreenModel.find({}, { _id: 0 });
            res.json(stocks);
        } else {
            const stocks = await Default.find();
            res.json(stocks);
        }

    } catch (error) {
        console.error('Error fetching stocks:', error);
        res.status(500).json({ message: 'Failed to fetch stocks' });
    }

});

// Route to get user ID by username
app.get('/api/getUserId', async (req, res) => {
    try {
        // Extract the username from the request parameters
        const username = req.session.username;

        // Query the database for a user with the given username
        const user = await User.findOne({ username });

        // Check if a user was found
        if (user) {
            // If a user is found, return their ID
            res.json({ userId: user._id });
        } else {
            // If no user is found, return an error message
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        // Handle any errors that occur during the query
        console.error('Error fetching user ID:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Function to create Watchlist model with dynamic collection name
function createWatchlistModel(watchlistId) {
    const collectionName = `${watchlistId}`; // Customize collection name

    return mongoose.model(collectionName, stockSchema);
}

app.post('/api/save_watchlist', async (req, res) => {
    try {
        const { saveName, userId, filteredStocks } = req.body;
        const nameExist = await Watchlist.findOne({ name: saveName, userId: userId })

        if (!nameExist) {
            const currentDate = new Date();
            const formattedDate = `${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
            const hours = currentDate.getHours().toString().padStart(2, '0');
            const minutes = currentDate.getMinutes().toString().padStart(2, '0');
            const formattedTime = `${hours}:${minutes}`;

            // Create a new Watchlist document using the Watchlist model
            const watchlist = new Watchlist({
                name: saveName,
                date: formattedDate,
                time: formattedTime,
                userId: userId,
            });
            // Save the Watchlist document to the database
            await watchlist.save();

            const watchlistId = watchlist._id;
            // Create Watchlist model with dynamic collection name
            const WatchlistModel = createWatchlistModel(watchlistId);
            // Insert each stock from filteredStocks into the WatchlistModel collection
            const insertedStocks = await WatchlistModel.insertMany(filteredStocks);

            console.log(`Inserted ${insertedStocks.length} stocks into collection ${WatchlistModel.collection.name}`);

            res.json({ message: 'Watchlist inserted successfully' });
        } else {
            // If the request was not successful, handle the error
            res.json({ message: 'Name exist' });
        }

    } catch (error) {
        // Error occurred, handle accordingly
        console.error('Error saving watchlist:', error);
        res.status(500).json({ message: 'Failed to save watchlist' });
    }
});

app.post('/api/toggleBookmark', async (req, res) => {
    try {
        const { stock } = req.body;
        const userId = req.session.userid;
        const ToggleBookModel = createWatchlistModel(userId);
        const updateBook = await ToggleBookModel.findOneAndUpdate(
            { Stock: stock },
            { $bit: { Book: { xor: 1 } } },
            { new: true }
        );

        if (updateBook) {
            console.log('Book value toggled successfully:', updateBook);
            res.json({ message: 'Toggle success' });
        } else {
            console.log('Document not found.')
        }

    } catch (error) {
        console.log('Toggle bookmark failed: ', error);
        res.json({ message: 'Failed to update bookmar' });
    }
});

app.get('/api/get_watchlist', async (req, res) => {
    try {
        const userId = req.session.userid;
        const getWatchlist = await Watchlist.find({ userId: userId });

        if (getWatchlist) {
            res.json(getWatchlist);
        } else {
            res.json('No watchlist found');
            console.log('No watchlist found');
        }
    }
    catch (error) {
        console.error('Error fetching watchlists:', error);
        res.status(500).json({ message: 'Failed to fetch watchlists' });
    }
});

app.post('/api/delete_watchlist', async (req, res) => {
    try {
        const { deleteTarget } = req.body;
        const userId = req.session.userid;

        const watchlist = await Watchlist.findOne({ name: deleteTarget, userId });

        if (!watchlist) {
            return res.status(404).json({ error: 'Delete target not found' });
        }

        const watchlistId = watchlist._id.toString(); // Convert watchlistId to a string
        console.log('WatchlistId: ', watchlistId);
        const collectionName = watchlistId;

        // Delete the watchlist document
        const deleted = await Watchlist.deleteOne({ name: deleteTarget, userId });

        if (deleted.deletedCount > 0) {
            try {
                console.log('Collection name: ', collectionName);
                // Drop the collection corresponding to the deleted watchlist
                const collectionToDelete = mongoose.connection.db.collection(collectionName);
                await collectionToDelete.drop();

                console.log('Watchlist and its collection deleted successfully.');
                return res.status(200).json({ message: 'Watchlist and its collection deleted successfully.', condition: true });
            } catch (err) {
                console.error('Error dropping collection:', err);
                return res.status(500).json({ error: 'Error dropping collection', condition: false });
            }
        } else {
            return res.status(404).json({ error: 'Watchlist not found' });
        }
    } catch (err) {
        console.error('Error deleting watchlist:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/rename_watchlist', async (req, res) => {
    try {
        const { renameTarget, renameInput } = req.body;
        const userId = req.session.userid;
        const nameExist = await Watchlist.findOne({ name: renameInput, userId: userId })

        if (!nameExist) {
            const updated = await Watchlist.updateOne(
                { name: renameTarget, userId: userId },
                { $set: { name: renameInput } },
                { new: true }
            );

            if (updated) {
                res.json({ message: 'Successfully rename', condition: true });
                console.log('Renamed');
            } else {
                console.log('Not renamed');
            }

        } else {
            res.json({ message: 'Name exist' });
        }

    } catch (error) {
        console.log('Error updating the watchlist');
    }
});

app.post('/api/get_screen', async (req, res) => {
    try {
        const { watchlistID } = req.body;
        const ScreenModel = createWatchlistModel(watchlistID);
        const getScreen = await ScreenModel.find({});

        if (getScreen.length > 0) {
            res.json(getScreen);
        } else {
            res.json('No watchlist found');
            console.log('No watchlist found');
        }
    }
    catch (error) {
        console.error('Error fetching watchlists:', error);
        res.status(500).json({ message: 'Failed to fetch watchlists' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
