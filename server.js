const express = require("express");
const app = express();
const { pool } = require("./dbConfig"); // Einbinden der dbConfig.js
const bcrypt = require("bcrypt");
const session = require('express-session');
const flash = require('express-flash');
const passport = require("passport");

const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server); // Einbinden von Socket.IO
const userSockets = {};


const dbFunctions = require("./databasepg");


const PORT = process.env.PORT || 4000;


const initializePassport = require("./passportConfig");
initializePassport(passport);

// Middleware

// Parses details from a form
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false })); //send details from frontend to backend


app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false //save session data?
})
);

// Funtion inside passport which initializes passport
app.use(passport.initialize());
// Store our variables to be persisted across the whole session. Works with app.use(Session) above
app.use(passport.session());
app.use(flash());

//Routen
app.get("/", (req, res) => {
  res.render('index');
});

app.get("/users/register", checkAuthenticated, (req, res) => {
  res.render("register")
})

app.get("/users/login", checkAuthenticated, (req, res) => {
  res.render("login")
})

app.get("/users/dashboard", checkNotAuthenticated, (req, res) => {
  res.render("dashboard", { user: req.user.vorname });
})

app.get("/users/userprofile", checkNotAuthenticated, async (req, res) => {
  try {
    const date = await dbFunctions.formatDate(req.user.beitrittsdatum);
    const { following, followers } = await dbFunctions.getUserFollowInfo(req.user.benutzerid);

    const followingInfo = await Promise.all(following.map(async id => {
      const user = await dbFunctions.getUserByID(id);
      return { id: user.benutzerid, name: `${user.vorname} ${user.nachname}` };
    }));

    const followersInfo = await Promise.all(followers.map(async id => {
      const user = await dbFunctions.getUserByID(id);
      return { id: user.benutzerid, name: `${user.vorname} ${user.nachname}` };
    }));

    res.render("userprofile", { user: req.user, date, followers: followersInfo, following: followingInfo });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});


app.get("/users/publicuserprofile/:userProfileID", checkNotAuthenticated, async (req, res) => {
  try {
    const userProfileID = req.params.userProfileID;
    

    const userFollows = await dbFunctions.checkFollowerRelationship(req.user.benutzerid, userProfileID);

    const { following, followers } = await dbFunctions.getUserFollowInfo(userProfileID);
    const followersCount = followers.length;

    const publicuser = await dbFunctions.getUserByID(userProfileID);

    console.log(publicuser.vorname);

    const gewerbe = await dbFunctions.getGewerbeByID(publicuser.gewerblichid);
    

    // Rufen Sie die gesamten Benutzerdaten ab
    const userProfileData = await dbFunctions.getUserByID(userProfileID);

    // Filtern und formatieren Sie die gewünschten Benutzerdaten
    const filteredUserData = {
      vorname: userProfileData.vorname,
      nachname: userProfileData.nachname,
      beitrittsdatum: dbFunctions.formatDate(userProfileData.beitrittsdatum),
      antwortrate: userProfileData.antwortrate,
      antwortzeit: userProfileData.antwortzeit,
      zufriedenheit: userProfileData.zufriedenheit,
      bewertungsanzahl: userProfileData.bewertungsanzahl,
      follower: followersCount,
      benutzerid: userProfileData.benutzerid
    };


    res.render("publicuserprofile", { user: filteredUserData, userFollows, gewerbe: gewerbe });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});


app.post("/users/rating", checkNotAuthenticated, async (req, res) => {
  try {
    const { publicUser, stars } = req.body;
    console.log(stars);
    await dbFunctions.updateUserRating(publicUser, parseInt(stars) );
    return res.redirect(`/users/publicuserprofile/${publicUser}`);

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.post("/users/follower", checkNotAuthenticated, async (req, res) => {

  try {
    const { publicuser } = req.body;
    if (await dbFunctions.checkFollowerRelationship(req.user.benutzerid, publicuser)) {
      await dbFunctions.deleteFollower(req.user.benutzerid, publicuser);
    } else {
      console.log("USERID: " + req.user.benutzerid);
      console.log("PUBLICUSER: " + publicuser);
      await dbFunctions.addFollower(req.user.benutzerid, publicuser);
    }


    return res.redirect(`/users/publicuserprofile/${publicuser}`);


  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});


app.get("/users/userprofileoffers", checkNotAuthenticated, async (req, res) => {
  try {
    const userOffers = await dbFunctions.getUserOffers(req.user.benutzerid);
    res.render("userprofileoffers", { user: req.user.vorname, userOffers });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.post("/users/deleteOffer", checkNotAuthenticated, async (req, res) => {
  try {
    const { anzeigeid } = req.body;
    await dbFunctions.deleteAnzeige(anzeigeid);

    return res.redirect("/users/userprofileoffers");

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.get("/users/offers", checkNotAuthenticated, async (req, res) => {
  try {
    const offers = await dbFunctions.accessSpecificTable("anzeige");

    // Iteriere durch die Angebote und füge Vor- und Nachnamen hinzu
    for (const offer of offers) {
      const user = await dbFunctions.getUserByID(offer.benutzer);
      offer.userVorname = user.vorname;
      offer.userNachname = user.nachname;
      offer.inserierungsdatum = dbFunctions.formatDate(offer.inserierungsdatum);
    }

    res.render("offers", { user: req.user, offers });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});


app.get("/users/createOffer", checkNotAuthenticated, (req, res) => {
  res.render("createOffer", { user: req.user.vorname });
})

app.post("/users/createOffer", checkNotAuthenticated, async (req, res) => {
  try {
    // Stelle sicher, dass der Benutzer eingeloggt ist
    if (!req.isAuthenticated()) {
      return res.redirect("/users/login");
    }

    const userId = req.user.benutzerid;
    const { name, ort, plz, preis, verhandlungsbasis, strasse, bilder, beschreibung, details, suche } = req.body;

    const errors = []; // Hier werden Fehler gesammelt

    console.log(name, ort, plz, preis, verhandlungsbasis, strasse, bilder, beschreibung, details, suche);

    const offerInformation = {
      'Name': name,
      'Ort': ort,
      'PLZ': plz,
      'Benutzer': userId,
      'Preis': preis,
      'Strasse': strasse,
      'Bilder': bilder,
      'Beschreibung': beschreibung,
      'Inserierungsdatum': new Date(),
      'Ansichtszahl': 0,
      'Details': details,
      'Verhandlungsbasis': verhandlungsbasis !== undefined ? true : false,
      'Suche': suche
    }

    await dbFunctions.insertAnzeige(offerInformation)

    return res.redirect("/users/userprofileoffers");
  }

  catch (error) {
    console.error('Error:', error.message);
    res.render("error"); // Zeige eine Fehlerseite an, falls ein Fehler auftritt
  }
});


app.get('/users/updateOffer/:anzeigeid', checkNotAuthenticated, async (req, res) => {
  try {
    const anzeigeid = req.params.anzeigeid;
    const existingData = await dbFunctions.getAnzeigeDetails(anzeigeid); // Hole die Daten für die Anzeige
    //console.log(existingData);
    res.render('updateOffer', { existingData });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.post("/users/updateOffer", checkNotAuthenticated, async (req, res) => {
  try {
    // Stelle sicher, dass der Benutzer eingeloggt ist
    if (!req.isAuthenticated()) {
      return res.redirect("/users/login");
    }

    const anzeigeId = req.body.anzeigeid; // Wert des Input-Felds "anzeigeid"
    const {
      name,
      ort,
      plz,
      preis,
      verhandlungsbasis,
      strasse,
      bilder,
      beschreibung,
      suche,
      details
    } = req.body; // Aktualisierte Felder

    // Führe hier die Validierung der Eingaben durch, falls erforderlich

    // Aktualisiere die Attribute der Anzeige
    await dbFunctions.updateOfferAttribute(anzeigeId, 'name', name);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'ort', ort);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'plz', plz);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'preis', preis);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'verhandlungsbasis', verhandlungsbasis === 'on'); // Wenn das Checkbox-Feld ausgewählt ist, wird es als "on" gesendet
    await dbFunctions.updateOfferAttribute(anzeigeId, 'strasse', strasse);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'bilder', bilder);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'beschreibung', beschreibung);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'suche', suche);
    await dbFunctions.updateOfferAttribute(anzeigeId, 'details', JSON.parse(details));
    // Weitere aktualisierte Felder hier aufrufen

    console.log('Offer attributes updated successfully!');
    res.redirect('/users/userProfileOffers'); // Zum Dashboard weiterleiten oder zur entsprechenden Seite
  } catch (error) {
    console.error('Error updating offer attributes:', error.message);
    res.status(500).send('Internal Server Error');
  }
});



app.get("/users/chats", checkNotAuthenticated, async (req, res) => {
  try {
    const lastMessages = await dbFunctions.getLastMessagesForUser(req.user);

    res.render("chats", { user: req.user, lastMessages });
  } catch (error) {
    console.error('Error:', error.message);
    res.render("error"); // Zeige eine Fehlerseite an, falls ein Fehler auftritt
  }
});

app.get("/users/chat-history/:chatPartnerID", checkNotAuthenticated, async (req, res) => {
  try {
    const user = req.user;
    const chatPartnerID = req.params.chatPartnerID;

    // Get chat history and chat partner details
    const chatHistory = await dbFunctions.getSortedChatHistory(user.benutzerid, chatPartnerID);
    const chatPartner = await dbFunctions.getUserByID(chatPartnerID);

    // Format date and time for each message
    chatHistory.forEach(message => {
      message.formattedDate = dbFunctions.formatDate(message.datum);
      message.formattedTime = dbFunctions.formatTime(message.uhrzeit);
    });

    res.render("chat-history", { user, chatHistory, chatPartner });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }

});

app.post("/users/send-message", checkNotAuthenticated, async (req, res) => {
  try {
    console.log(req.body.messageText);
    const senderID = req.body.senderID;
    const receiverID = req.body.receiverID;
    const messageText = req.body.messageText.trim();



    if (messageText === '') {
      console.log('Message is empty. Not sending message.');
      return;
      //return res.redirect(`/users/chat-history/${receiverID}`);
    }

    await dbFunctions.addMessageToChat(senderID, receiverID, messageText);


    const receiverSocketId = userSockets[receiverID];
    const senderSocketId = userSockets[senderID];

     // Wenn Sie die Nachricht senden, zusätzlich 'own-new-message'-Event auslösen.
     if (senderID) {
      console.log('Sending message via Socket.io to receiver:', receiverID);
      const currentDate = new Date(); // Aktuelles Datum
      const formattedDate = dbFunctions.formatDate(currentDate); // Formatieren des Datums
      const formattedTime = dbFunctions.formatTime(`${currentDate.getHours()}:${currentDate.getMinutes()}`); // Formatieren der Uhrzeit
      const date = formattedDate;
      const time = formattedTime;
       io.to(senderSocketId).emit('own-new-message', { message: messageText, senderId: senderID, date: date, time: time });
     } else {
      console.log('No socket found for receiver:', senderID);
    }
    

    if (receiverSocketId) {
      console.log('Sending message via Socket.io to receiver:', receiverID);
      const currentDate = new Date(); // Aktuelles Datum
      const formattedDate = dbFunctions.formatDate(currentDate); // Formatieren des Datums
      const formattedTime = dbFunctions.formatTime(`${currentDate.getHours()}:${currentDate.getMinutes()}`); // Formatieren der Uhrzeit
      const date = formattedDate;
      const time = formattedTime;
      io.to(receiverSocketId).emit('new-message', { message: messageText, senderId: senderID, date: date, time: time });
    } else {
      console.log('No socket found for receiver:', receiverID);
    }

    res.status(200).send('Message sent successfully');
    //res.redirect(`/users/chat-history/${receiverID}`);
  } catch (error) {
    console.error('Error sending message:', error.message);
    res.status(500).send('Internal Server Error');
  }
});


app.get("/users/settings", async (req, res) => {
  // Stelle sicher, dass der Benutzer eingeloggt ist
  if (!req.isAuthenticated()) {
    return res.redirect("/users/login");
  }

  try {
    const gewerbeID = req.user.gewerblichid;
    const gewerbe = await dbFunctions.getGewerbeByID(gewerbeID);

    res.render("settings", { user: req.user, gewerblich: gewerbe });

  } catch (error) {
    console.error('Error fetching Gewerbe data:', error.message);
    res.redirect("/users/dashboard"); // Weiterleitung im Fehlerfall
  }
});

app.post("/users/settings", checkNotAuthenticated, async (req, res) => {
  try {
    // Stelle sicher, dass der Benutzer eingeloggt ist
    if (!req.isAuthenticated()) {
      return res.redirect("/users/login");
    }

    const userId = req.user.benutzerid;
    const { newFirstName, newLastName, newEmail, newPassword, oldPassword, newPLZ, newOrt, newTelefon, newStrasse, newHausnummer, confirmNewPassword,gewerblichName, gewerblichOeffnungszeiten, gewerblichWebsite, gewerblichRechtlicheAngaben, gewerblichUnternehmensbeschreibung } = req.body;

    const errors = []; // Hier werden Fehler gesammelt

    // Passwort-Validierung: Mindestens 6 Zeichen, mindestens ein Großbuchstabe und eine Zahl
    if (newPassword && newPassword.length < 6) {
      errors.push("Passwort muss mindestens 6 Zeichen lang sein.");
    }
    if (newPassword && !(/[A-Z]/.test(newPassword))) {
      errors.push("Passwort muss mindestens einen Großbuchstaben enthalten.");
    }
    if (newPassword && !(/\d/.test(newPassword))) {
      errors.push("Passwort muss mindestens eine Zahl enthalten.");
    }
    if (newPassword !== '' && newPassword !== confirmNewPassword) {
      errors.push("Das neue Passwort stimmt nicht überein.");
    }

    // Hier kannst du weitere Validierungen hinzufügen, z.B. für Email, PLZ, etc.

    if (await dbFunctions.comparePasswords(oldPassword, req.user.passworthash)) {
      // Nur wenn keine Validierungsfehler vorliegen
      if (errors.length === 0) {
        if (newPassword) {
          await dbFunctions.updateUserAttribute(userId, "Passworthash", await bcrypt.hash(newPassword, 10));
        }
        await dbFunctions.updateUserAttribute(userId, "Vorname", newFirstName);
        await dbFunctions.updateUserAttribute(userId, "Nachname", newLastName);
        //await dbFunctions.updateUserAttribute(userId, "Email", newEmail); ERST NACH BESTÄTIGUNG
        await dbFunctions.updateUserAttribute(userId, "PLZ", newPLZ);
        await dbFunctions.updateUserAttribute(userId, "Ort", newOrt);
        await dbFunctions.updateUserAttribute(userId, "Telefon", newTelefon);
        await dbFunctions.updateUserAttribute(userId, "Strasse", newStrasse);
        await dbFunctions.updateUserAttribute(userId, "Hausnummer", newHausnummer);

        await dbFunctions.addGewerbe(userId, gewerblichName, gewerblichOeffnungszeiten, gewerblichWebsite, gewerblichRechtlicheAngaben, gewerblichUnternehmensbeschreibung);

        req.flash('success_msg', "Benutzerinformationen erfolgreich aktualisiert.");
      }
    } else {
      errors.push('Falsches Passwort.');
    }

    if (errors.length > 0) {
      req.flash('error_msg', errors);
    }

    res.redirect("/users/settings");
  } catch (error) {
    console.error('Error updating user information:', error.message);
    res.render("settings", { errors: [{ message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' }] });
  }
});




io.on('connection', (socket) => {
  console.log('A user connected');

  // Sie müssen hier eine Benutzer-ID vom Client erhalten
  // Dies könnte beispielsweise eine Authentifizierungstoken-ID oder eine andere Form der Identifizierung sein
  socket.on('register-user', (userId) => {
    console.log('Registered user with ID:', userId);
    userSockets[userId] = socket.id;
  });


  socket.on('disconnect', () => {
    // Entfernen Sie die Socket-ID des Benutzers, wenn er die Verbindung trennt
    for (let userId in userSockets) {
      if (userSockets[userId] === socket.id) {
        delete userSockets[userId];
        break;
      }
    }
    console.log('User disconnected');
  });
});




app.get("/users/logout", (req, res) => {
  req.logOut(() => {
    req.flash('success_msg', "Erfolgreich ausgeloggt!");
    res.redirect("/users/login");
  });
});


app.post("/users/register", async (req, res) => {
  let { vorname, name, email, password, password2, plz } = req.body;
  let errors = [];

  if (!vorname || !name || !email || !password || !password2 || !plz) {
    errors.push({ message: "Bitte alle Felder ausfüllen." });
  }

  if (password.length < 6) {
    errors.push({ message: "Das passwort muss mindestens 6 zeichen haben." });
  }

  if (password !== password2) {
    errors.push({ message: "Passwörter stimmen nicht überein." });
  }

  if (!(/\d/.test(password))) {
    errors.push({ message: "Passwort muss mindestens eine Zahl enthalten." });
  }

  if (!(/[A-Z]/.test(password))) {
    errors.push({ message: "Passwort muss mindestens einen Großbuchstaben enthalten." });
  }



  if (errors.length > 0) {
    res.render('register', { errors });
  } else {
    try {
      // Validation passed
      let hashedPassword = await bcrypt.hash(password, 10);

      const emailExistsQuery = 'SELECT * FROM benutzer WHERE email = $1';
      const emailExistsValues = [email];

      pool.query(emailExistsQuery, emailExistsValues, async (err, results) => {
        if (err) {
          throw err;
        }

        console.log(results.rows);

        if (results.rows.length > 0) {
          errors.push({ message: "E-Mail bereits vergeben" });
          res.render("register", { errors });
        } else {
          const insertUserQuery = `
          INSERT INTO benutzer (Vorname, Nachname, Email, Passworthash, PLZ, Beitrittsdatum)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;
          const insertUserValues = [vorname, name, email, hashedPassword, plz, new Date()];

          await pool.query(insertUserQuery, insertUserValues);

          req.flash('success_msg', "Registrierung erfolgreich, weiter mit Login.");
          res.redirect("/users/login");
        }
      });
    } catch (error) {
      console.error('Error:', error.message);
      res.render('register', { errors: [{ message: 'Ein Fehler ist während der Registrierung aufgetreten, versuchen Sie es später erneut.' }] });
    }
  }
});




//Prüfen ob Benutzer eingeloggt ist wenn er z.B AUF Dashboard zugreifen möchte

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/users/dashboard");
  }
  next();
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/users/login");
}


app.post(
  "/users/login",
  passport.authenticate("local", {
    successRedirect: "/users/dashboard",
    failureRedirect: "/users/login",
    failureFlash: true
  })
);


server.listen(PORT, () => {
  console.log(`Server running on Port ${PORT}`);
});