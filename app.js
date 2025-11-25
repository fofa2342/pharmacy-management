// all the imports

import 'dotenv/config';
import express from 'express';
import myConnection from 'express-myconnection';
import bcrypt from 'bcrypt';
import mysql from 'mysql2';
import session from 'express-session';

// variables definition

const app = express();

const dbOptions = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: {
        rejectUnauthorized: false
    }
};

app.use(myConnection(mysql, dbOptions, 'pool'));

// Middleware pour parser les données du formulaire
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // Ajout du middleware pour parser les requêtes JSON


// Configuration des sessions
app.use(session({
    secret: 'votre_secret_key', // Clé secrète pour signer les cookies de session
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // À mettre à `true` si vous utilisez HTTPS
}));

// Configuration du moteur de rendu EJS
app.set('view engine', 'ejs');

// Middleware pour vérifier l'authentification
function verifierAuthentification(req, res, next) {
    if (req.session.utilisateur) {
        next(); // L'utilisateur est connecté, continuer
    } else {
        res.redirect('/login'); // Rediriger vers la page de connexion
    }
}


// Route pour la page de connexion
app.get('/login', (req, res) => {
    res.render('login'); // Affiche la page de connexion
});

// Route pour gérer la soumission du formulaire de connexion
app.post('/login', (req, res) => {
    console.log("Corps de la requête reçu :", req.body); // Log pour vérifier req.body

    const { matricule, motDePasse } = req.body;
    
    // Vérifier si matricule est défini
    if (!matricule) {
        console.error("Matricule non défini dans req.body");
        return res.status(400).json({ error: "Matricule manquant dans la requête." });
    }

    // Nettoyer le matricule (supprimer les espaces)
    const matriculeNettoye = matricule.replace(/\s/g, ''); // Supprime tous les espaces

    // Requête SQL pour récupérer l'utilisateur
    const query = `SELECT * FROM personnel WHERE REPLACE(matricule, ' ', '') = ?`;

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).json({ error: "Erreur de connexion à la base de données" });
        }

        // Exécuter la requête SQL
        connection.query(query, [matriculeNettoye], (error, results) => {
            if (error) {
                console.error("Erreur lors de la requête SQL :", error);
                return res.status(500).json({ error: "Erreur lors de la récupération des données" });
            }

            // Aucun résultat trouvé
            if (results.length === 0) {
                console.log("Aucun résultat trouvé pour le matricule :", matriculeNettoye);
                return res.status(401).json({ error: "Matricule ou mot de passe incorrect." });
            }

            const utilisateur = results[0];
            console.log("Utilisateur trouvé :", utilisateur);

            // Vérifier le mot de passe
            bcrypt.compare(motDePasse, utilisateur.mot_de_passe, (err, isMatch) => {
                if (err) {
                    console.error("Erreur lors de la vérification du mot de passe :", err);
                    return res.status(500).json({ error: "Erreur interne." });
                }
                
                if (!isMatch) {
                    console.log("Mot de passe incorrect pour l'utilisateur :", utilisateur.matricule);
                    return res.status(401).json({ error: "Matricule ou mot de passe incorrect." });
                }

                // Connexion réussie
                console.log("Connexion réussie pour l'utilisateur :", utilisateur.matricule);

                // Enregistrer l'action de connexion dans la table logs_connexion
                const logQuery = `
                    INSERT INTO logs_connexion (nom, prenom, date_connection, heure_connection, poste, action)
                    VALUES (?, ?, CURDATE(), CURTIME(), ?, 'connexion')
                `;
                connection.query(logQuery, [utilisateur.nom, utilisateur.prenom, utilisateur.poste], (logError, logResults) => {
                    if (logError) {
                        console.error("Erreur lors de l'enregistrement du log :", logError);
                    } else {
                        console.log("Log de connexion enregistré avec succès.");
                    }
                });

                // Stocker l'utilisateur dans la session
                req.session.utilisateur = utilisateur;

                // Rediriger en fonction du rôle
                let redirectUrl = "";
                switch (utilisateur.role) {
                    case 'administrateur': redirectUrl = "/admin"; break;
                    case 'accueil': redirectUrl = "/"; break;
                    case 'vendeur': redirectUrl = "/vente"; break;
                    case 'verifieur': redirectUrl = "/verification"; break;
                    default: return res.status(403).json({ error: "Accès refusé." });
                }

                // Retourner la réponse
                res.json({ success: true, redirect: redirectUrl });
            });
        });
    });
});

// Route pour la déconnexion
app.get('/logout', (req, res) => {
    const utilisateur = req.session.utilisateur;

    // Enregistrer l'action de déconnexion dans la table logs_connexion
    const logQuery = `
        INSERT INTO logs_connexion (nom, prenom, date_connection, heure_connection, poste, action)
        VALUES (?, ?, CURDATE(), CURTIME(), ?, 'déconnexion')
    `;
    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(logQuery, [utilisateur.nom, utilisateur.prenom, utilisateur.poste], (logError, logResults) => {
            if (logError) {
                console.error("Erreur lors de l'enregistrement du log :", logError);
            } else {
                console.log("Log de déconnexion enregistré avec succès.");
            }
        });
    });

    // Détruire la session et rediriger vers la page de connexion
    req.session.destroy((err) => {
        if (err) {
            console.error("Erreur lors de la déconnexion :", err);
            return res.status(500).send("Erreur lors de la déconnexion");
        }
        res.redirect('/login');
    });
});

// Route pour la page d'accueil (protégée)
app.get('/', verifierAuthentification, (req, res) => {
    const today = new Date();
    const todayFormatted = today.toISOString().split('T')[0]; // Format YYYY-MM-DD

    // Calcul de la date dans 1 mois
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const oneMonthLaterFormatted = oneMonthLater.toISOString().split('T')[0];

    // Requêtes SQL avec des paramètres
    const queryLowStock = 'SELECT * FROM stock WHERE quantite < 10';
    const queryExpiredDate = 'SELECT * FROM stock WHERE dateperemption < ?';
    const queryNearExpiration = 'SELECT * FROM stock WHERE dateperemption BETWEEN ? AND ?';
    const queryTotalStock = 'SELECT SUM(quantite) AS totalStock FROM stock'; // Somme totale des stocks
    const queryTotalProducts = 'SELECT COUNT(*) AS totalProducts FROM stock'; // Nombre total de produits

    // Connexion à la base de données et exécution des requêtes
    req.getConnection((err, connection) => {
        if (err) throw err;

        // Requête pour les produits en faible stock
        connection.query(queryLowStock, (error, resultsLowStock) => {
            if (error) throw error;

            // Requête pour les produits expirés
            connection.query(queryExpiredDate, [todayFormatted], (error, resultsExpiredDate) => {
                if (error) throw error;

                // Requête pour les produits proches de l'expiration
                connection.query(queryNearExpiration, [todayFormatted, oneMonthLaterFormatted], (error, resultsNearExpiration) => {
                    if (error) throw error;

                    // Requête pour la somme totale des stocks
                    connection.query(queryTotalStock, (error, resultsTotalStock) => {
                        if (error) throw error;

                        // Requête pour le nombre total de produits
                        connection.query(queryTotalProducts, (error, resultsTotalProducts) => {
                            if (error) throw error;

                            // Rendre la vue 'accueil' avec les données récupérées
                            res.status(200).render('accueil', {
                                lowStockProducts: resultsLowStock, // Produits en faible stock
                                expiredDateProducts: resultsExpiredDate, // Produits expirés
                                nearExpirationProducts: resultsNearExpiration, // Produits proches de l'expiration
                                totalStock: resultsTotalStock[0].totalStock, // Somme totale des stocks
                                totalProducts: resultsTotalProducts[0].totalProducts, // Nombre total de produits
                                utilisateur: req.session.utilisateur // Passer l'utilisateur à la vue
                            });
                        });
                    });
                });
            });
        });
    });
});

// Route pour la page administrateur (protégée)
app.get('/admin', (req, res) => {
    // Récupérer les paramètres de filtrage depuis l'URL
    const { nom, prenom, poste, action } = req.query;

    // Construire la requête SQL en fonction des filtres
    let query = 'SELECT * FROM logs_connexion WHERE 1=1';
    const params = [];

    if (nom) {
        query += ' AND nom LIKE ?';
        params.push(`%${nom}%`);
    }

    if (prenom) {
        query += ' AND prenom LIKE ?';
        params.push(`%${prenom}%`);
    }

    if (poste) {
        query += ' AND poste LIKE ?';
        params.push(`%${poste}%`);
    }

    if (action) {
        query += ' AND action LIKE ?';
        params.push(`%${action}%`);
    }

    // Trier par date et heure de connexion (du plus récent au plus ancien)
    query += ' ORDER BY date_connection DESC, heure_connection DESC';

    // Exécuter la requête SQL
    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(query, params, (error, results) => {
            if (error) {
                console.error("Erreur lors de la récupération des données :", error);
                return res.status(500).send("Erreur lors de la récupération des données");
            }

            // Rendre la vue admin avec les données filtrées
            res.render('admin', { logs: results });
        });
    });
});

// Route pour la page de vente (protégée)
app.get('/vente', (req, res) => {
    // Récupérer les paramètres de filtrage depuis l'URL
    const { nom, categorie } = req.query;

    // Construire la requête SQL en fonction des filtres
    let query = 'SELECT id, nom, prix, quantite FROM stock WHERE 1=1';
    const params = [];

    if (nom) {
        query += ' AND nom LIKE ?';
        params.push(`%${nom}%`);
    }

    if (categorie) {
        query += ' AND categorie = ?';
        params.push(categorie);
    }

    // Exécuter la requête SQL
    req.getConnection((err, connection) => {
        if (err) {
            console.error("❌ Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(query, params, (error, results) => {
            if (error) {
                console.error("❌ Erreur lors de la récupération des stocks :", error);
                return res.status(500).send("Erreur lors de la récupération des stocks");
            }

            console.log("✅ Résultats de la requête :", results); // Debug

            // Vérifier que results est bien un tableau
            res.render('vente', { produits: Array.isArray(results) ? results : [], req: req });
        });
    });
});


app.post('/vente', async (req, res) => {
    const { stock: stockData } = req.body;

    if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
        return res.status(400).json({ error: "Le champ 'stock' est manquant ou invalide." });
    }

    req.getConnection(async (err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).json({ error: "Erreur de connexion à la base de données" });
        }

        try {
            await new Promise((resolve, reject) => connection.beginTransaction(err => err ? reject(err) : resolve()));

            // Récupération et verrouillage des produits en une seule requête
            const productIds = stockData.map(p => p.id_produit);
            const placeholders = productIds.map(() => '?').join(',');
            const checkQuery = `SELECT id, quantite, prix FROM stock WHERE id IN (${placeholders}) FOR UPDATE`;
            const products = await new Promise((resolve, reject) => {
                connection.query(checkQuery, productIds, (err, results) => {
                    if (err) return reject(err);
                    resolve(results);
                });
            });

            // Vérification des stocks
            const stockMap = new Map(products.map(p => [p.id, p]));
            for (const produit of stockData) {
                const stock = stockMap.get(produit.id_produit);
                if (!stock || stock.quantite < produit.quantite) {
                    throw new Error(`Stock insuffisant pour le produit ${produit.id_produit}`);
                }
            }

            // Insertion des ventes
            const insertQuery = `INSERT INTO ventes (id_produit, quantite, prix_total) VALUES ?`;
            const insertValues = stockData.map(p => [p.id_produit, p.quantite, p.quantite * stockMap.get(p.id_produit).prix]);
            await new Promise((resolve, reject) => {
                connection.query(insertQuery, [insertValues], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });

            // Mise à jour du stock en une seule requête
            // Note: complex CASE updates are harder to parameterize perfectly without multiple queries or stored procedures,
            // but we can sanitize the IDs at least. Since productIds are derived from input, we should be careful.
            // Ideally, perform updates individually or use a safe construction.
            // For this fix, we will stick to the logic but ensure IDs are integers.
            
            const safeStockData = stockData.map(p => ({
                id_produit: parseInt(p.id_produit, 10),
                quantite: parseInt(p.quantite, 10)
            })).filter(p => !isNaN(p.id_produit) && !isNaN(p.quantite));

             const updateQuery = `UPDATE stock SET quantite = CASE 
                ${safeStockData.map(p => `WHEN id = ${p.id_produit} THEN quantite - ${p.quantite}`).join(' ')}
            END WHERE id IN (${safeStockData.map(p => p.id_produit).join(',')})`;
            
            await new Promise((resolve, reject) => {
                connection.query(updateQuery, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });

            // Validation de la transaction
            await new Promise((resolve, reject) => connection.commit(err => err ? reject(err) : resolve()));

            res.json({ success: true, message: "Vente enregistrée avec succès." });
        } catch (error) {
            console.error("Erreur lors de la transaction :", error);
            await new Promise(resolve => connection.rollback(() => resolve()));
            res.status(400).json({ error: error.message });
        } finally {
            connection.release();
        }
    });
});

// Route pour afficher la page pharmacie.ejs
app.get('/parametre', (req, res) => {
    res.render('parametre');
});

/*app.get('/facture/:idVente', (req, res) => {
    const idVente = req.params.idVente;
    console.log("ID de la vente :", idVente); // Log pour vérifier l'ID de la vente

    // Requête pour récupérer les stock de la vente
    const query = `
        SELECT v.id_produit, p.nom, v.quantite, p.prix, (v.quantite * p.prix) AS prix_total
        FROM ventes v
        JOIN stock p ON v.id_produit = p.id
        WHERE v.id_vente = ?`;

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(query, [idVente], (error, results) => {
            if (error) {
                console.error("Erreur lors de la récupération de la facture :", error);
                return res.status(500).send("Erreur lors de la récupération de la facture");
            }

            console.log("stock récupérés :", results); // Log pour vérifier les stock

            // Calculer le total de la facture
            const total = results.reduce((sum, produit) => sum + produit.prix_total, 0);
            console.log("Total de la facture :", total); // Log pour vérifier le total

            // Rendre la vue de la facture avec les données
            res.render('facture', { stock: results, total, idVente });
        });
    });
});*/
// Route pour enregistrer les données de la pharmacie
app.post('/enregistrer-pharmacie', (req, res) => {
    const { nom, numero, message1, message2 } = req.body;

    const query = 'INSERT INTO pharmacies (nom_pharmacie, numero_pharmacie, message_fin_1, message_fin_2) VALUES (?, ?, ?, ?)';
    connection.query(query, [nom, numero, message1, message2], (error, results, fields) => {
        if (error) {
            console.error('Erreur lors de l\'enregistrement:', error);
            res.status(500).json({ message: 'Erreur lors de l\'enregistrement' });
            return;
        }
        console.log('Pharmacie enregistrée avec succès, ID:', results.insertId);

        // Récupérer le dernier enregistrement
        const lastId = results.insertId;
        const selectQuery = 'SELECT * FROM pharmacies WHERE id = ?';
        connection.query(selectQuery, [lastId], (error, results, fields) => {
            if (error) {
                console.error('Erreur lors de la récupération du dernier enregistrement:', error);
                res.status(500).json({ message: 'Erreur lors de la récupération du dernier enregistrement' });
                return;
            }

            // Renvoyer le dernier enregistrement au frontend
            const dernierEnregistrement = results[0];
            res.status(200).json({ 
                message: 'Pharmacie enregistrée avec succès !',
                data: dernierEnregistrement
            });
        });
    });
});

// Route pour récupérer le dernier enregistrement
app.get('/dernier-enregistrement', (req, res) => {
    const query = 'SELECT * FROM pharmacies ORDER BY id DESC LIMIT 1';
    connection.query(query, (error, results, fields) => {
        if (error) {
            console.error('Erreur lors de la récupération du dernier enregistrement:', error);
            res.status(500).json({ message: 'Erreur lors de la récupération du dernier enregistrement' });
            return;
        }

        if (results.length === 0) {
            res.status(404).json({ message: 'Aucun enregistrement trouvé' });
            return;
        }

        // Renvoyer le dernier enregistrement au frontend
        const dernierEnregistrement = results[0];
        res.status(200).json({ data: dernierEnregistrement });
    });
});

app.get('/facture', (req, res) => {
    res.status(200).render('facture');
});

// Route pour la page de vérification (protégée)
app.get('/verification', (req, res) => {
    console.log("Paramètres de filtrage reçus :", req.query); // Log pour vérifier les paramètres

    const { id, nom, prix, voie, forme, quantite } = req.query;

    let query = 'SELECT * FROM stock WHERE 1=1';
    const params = [];

    if (id) {
        query += ' AND id = ?';
        params.push(id);
    }

    if (nom) {
        query += ' AND nom LIKE ?';
        params.push(`%${nom}%`);
    }

    if (prix) {
        query += ' AND prix = ?';
        params.push(prix);
    }

    if (voie) {
        query += ' AND voie LIKE ?';
        params.push(`%${voie}%`);
    }

    if (forme) {
        query += ' AND forme LIKE ?';
        params.push(`%${forme}%`);
    }

    if (quantite) {
        query += ' AND quantite = ?';
        params.push(quantite);
    }

    console.log("Requête SQL générée :", query); // Log pour vérifier la requête SQL
    console.log("Paramètres SQL :", params); // Log pour vérifier les paramètres

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(query, params, (error, results) => {
            if (error) {
                console.error("Erreur lors de la récupération des données :", error);
                return res.status(500).send("Erreur lors de la récupération des données");
            }

            console.log("Résultats de la requête SQL :", results); // Log pour vérifier les résultats

            res.render('verification', { stock: results });
        });
    });
});

// Route pour la page d'entrée de stock (protégée)
// Route pour l'insertion d'un produit
app.post('/entree', verifierAuthentification, (req, res) => {
    const { id, nom, prix, voie, quantite, forme, dateentree,dateperemption,datecreation,modif_id } = req.body;

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        if (modif_id) {
            // Modification du produit existant
            const updateQuery = `
                UPDATE stock 
                SET nom = ?, prix = ?, voie = ?, quantite = ?, dateperemption =?, datecreation =?, forme =?, dateentree =?
                WHERE id = ?
            `;

            connection.query(updateQuery, [nom, prix, voie, quantite, dateperemption,datecreation, forme,dateentree, modif_id], (error, results) => {
                if (error) {
                    console.error("Erreur lors de la modification :", error);
                    return res.status(500).send("Erreur lors de la modification");
                }
                res.redirect('/entree'); // Recharge la liste après modification
            });

        } else {
            // Vérifier si l'ID existe déjà
            const checkQuery = 'SELECT COUNT(*) AS count FROM stock WHERE id = ?';
            connection.query(checkQuery, [id], (error, results) => {
                if (error) {
                    console.error("Erreur lors de la vérification de l'ID :", error);
                    return res.status(500).send("Erreur lors de la vérification");
                }

                if (results[0].count > 0) {
                    return res.status(400).send("Erreur : un produit avec cet ID existe déjà.");
                }

                // Insertion d'un nouveau produit
                const insertQuery = `
                    INSERT INTO stock (id, nom, prix, voie, quantite, forme, dateentree, dateperemption, datecreation)
                    VALUES (?, ?, ?, ?, ?,?,?,?,?)
                `;

                connection.query(insertQuery, [id, nom, prix, voie, quantite, forme,dateentree, datecreation,dateperemption], (error, results) => {
                    if (error) {
                        console.error("Erreur lors de l'insertion des données :", error);
                        return res.status(500).send("Erreur lors de l'enregistrement des données");
                    }

                    res.redirect('/entree');
                });
            });
        }
    });
});

// Route pour afficher les stock avec filtres
app.get('/entree', verifierAuthentification, (req, res) => {
    const { id, nom, prix, forme, voie, datecreation, dateperemption, quantite, dateentree } = req.query;

    let query = 'SELECT * FROM stock WHERE 1=1';
    const params = [];

    if (id) {
        query += ' AND id = ?';
        params.push(id);
    }
    if (nom) {
        query += ' AND nom LIKE ?';
        params.push('%${nom}%');
    }
    if (prix) {
        query += ' AND prix = ?';
        params.push(prix);
    }
    if (forme) {
        query += ' AND forme LIKE ?';
        params.push('%${forme}%');
    }
    if (voie) {
        query += ' AND voie LIKE ?';
        params.push('%${voie}%');
    }
    if (datecreation) {
        query += ' AND datecreation = ?';
        params.push(datecreation);
    }
    if (dateperemption) {
        query += ' AND dateperemption = ?';
        params.push(dateperemption);
    }
    if (quantite) {
        query += ' AND quantite = ?';
        params.push(quantite);
    }
    if (dateentree) {
        query += ' AND dateentree = ?';
        params.push(dateentree);
    }

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(query, params, (error, results) => {
            if (error) {
                console.error("Erreur lors de la récupération des données :", error);
                return res.status(500).send("Erreur lors de la récupération des données");
            }

            res.render('entree', { stock: results, utilisateur: req.session.utilisateur });
        });
    });
});

// Route pour supprimer un produit
app.post('/supprimer/:id', verifierAuthentification, (req, res) => {
    const { id } = req.params;

    const query = 'DELETE FROM stock WHERE id = ?';

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(query, [id], (error) => {
            if (error) {
                console.error("Erreur lors de la suppression :", error);
                return res.status(500).send("Erreur lors de la suppression du produit");
            }

            res.redirect('/entree');
        });
    });
});

// Route pour modifier un produit
app.post('/modifier/:id', verifierAuthentification, (req, res) => {
    const { id } = req.params;
    const { nom, prix, forme, voie, datecreation, dateperemption, quantite } = req.body;

    const query = "UPDATE stock SET nom = ?, prix = ?, forme = ?, voie = ?, datecreation = ?, dateperemption = ?, quantite = ? WHERE id = ?";

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        connection.query(query, [nom, prix, forme, voie, datecreation, dateperemption, quantite, id], (error) => {
            if (error) {
                console.error("Erreur lors de la modification :", error);
                return res.status(500).send("Erreur lors de la modification du produit");
            }

            res.redirect('/entree');
        });
    });
});

// Route pour la page de gestion du personnel (protégée)
app.get('/pers', verifierAuthentification, (req, res) => {
    // Récupérer les paramètres de filtrage depuis l'URL
    const { matricule, nom, prenom, poste, contrat } = req.query;

    // Construire la requête SQL en fonction des filtres
    let query = 'SELECT * FROM personnel WHERE 1=1';
    const params = [];

    if (matricule) {
        query += ' AND matricule LIKE ?';
        params.push(`%${matricule}%`);
    }

    if (nom) {
        query += ' AND nom LIKE ?';
        params.push(`%${nom}%`);
    }

    if (prenom) {
        query += ' AND prenom LIKE ?';
        params.push(`%${prenom}%`);
    }

    if (poste) {
        query += ' AND poste = ?';
        params.push(poste);
    }

    if (contrat) {
        query += ' AND contrat = ?';
        params.push(contrat);
    }

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        // Exécuter la requête SQL avec les paramètres de filtrage
        connection.query(query, params, (error, results) => {
            if (error) {
                console.error("Erreur lors de la récupération des données :", error);
                return res.status(500).send("Erreur lors de la récupération des données");
            }

            // Rendre la vue `pers.ejs` en passant les données filtrées
            res.render('pers', { personnel: results, utilisateur: req.session.utilisateur });
        });
    });
});

// Route pour la page de gestion du personnel (protégée)
app.post('/pers', verifierAuthentification, (req, res) => {
    const { modif_matricule, matricule, nom, prenom, datenaissance, dateembauche, diplome, poste, contrat } = req.body;

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).send("Erreur de connexion à la base de données");
        }

        if (modif_matricule) {
            // Si un matricule est fourni, c'est une modification
            const updateQuery = `
                UPDATE personnel
                SET matricule = ?, nom = ?, prenom = ?, datenaissance = ?, dateembauche = ?, diplome = ?, poste = ?, contrat = ?
                WHERE matricule = ?
            `;
            connection.query(updateQuery, [matricule, nom, prenom, datenaissance, dateembauche, diplome, poste, contrat, modif_matricule], (error, results) => {
                if (error) {
                    console.error("Erreur lors de la modification :", error);
                    return res.status(500).send("Erreur lors de la modification");
                }
                res.redirect('/pers');
            });
        } else {
            // Sinon, c'est un nouvel enregistrement
            const checkQuery = 'SELECT COUNT(*) AS count FROM personnel WHERE matricule = ?'; // Ajout d'un espace ici
            connection.query(checkQuery, [matricule], (error, results) => {
                if (error) {
                    console.error("Erreur lors de la vérification du matricule :", error);
                    return res.status(500).send("Erreur lors de la vérification");
                }

                if (results[0].count > 0) {
                    return res.status(400).send("Erreur : un employé avec ce matricule existe déjà.");
                }

                // Insertion d'un nouvel employé
                const insertQuery = `
                    INSERT INTO personnel (matricule, nom, prenom, datenaissance, dateembauche, diplome, poste, contrat)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                connection.query(insertQuery, [matricule, nom, prenom, datenaissance, dateembauche, diplome, poste, contrat], (error, results) => {
                    if (error) {
                        console.error("Erreur lors de l'insertion des données :", error);
                        return res.status(500).send("Erreur lors de l'enregistrement des données");
                    }
                    res.redirect('/pers');
                });
            });
        }
    });
});

app.delete('/pers/:matricule', verifierAuthentification, (req, res) => {
    const { matricule } = req.params;

    req.getConnection((err, connection) => {
        if (err) {
            console.error("Erreur de connexion à la base de données :", err);
            return res.status(500).json({ success: false, message: "Erreur de connexion à la base de données" });
        }

        const query = 'DELETE FROM personnel WHERE matricule = ?';

        connection.query(query, [matricule], (error, results) => {
            if (error) {
                console.error("Erreur lors de la suppression :", error);
                return res.status(500).json({ success: false, message: "Erreur lors de la suppression de l'employé" });
            }

            res.json({ success: true, message: "Employé supprimé avec succès" });
        });
    });
});


// Démarrer le serveur
app.listen(3003, () => {
    console.log('Serveur démarré sur http://localhost:3003');
});