# PRD -- DrumPilot AI

## Version

1.0

# Vision

Créer le meilleur assistant Android pour les batteurs, capable de
préparer et lancer n'importe quel morceau en quelques secondes.

L'application doit permettre de : - retrouver instantanément le tempo
d'un morceau, - lancer le morceau avec assurance, - gérer une setlist
complète, - reconnaître automatiquement une chanson grâce au micro, -
fournir toutes les informations utiles au batteur, - fonctionner
entièrement hors connexion pendant un concert.

Le téléphone devient un véritable copilote de scène.

# Problème

Aujourd'hui, un batteur doit souvent : - écouter le début du morceau, -
retrouver le bon tempo, - se souvenir de la structure, - vérifier les
breaks, - retrouver le prochain morceau de la setlist.

Cela fait perdre du temps pendant les répétitions et augmente le stress
sur scène.

# Objectif

Réduire le temps entre **« Quel morceau joue-t-on ? »** et **« Le groupe
démarre. »** à moins de **3 secondes**.

# Utilisateurs

## Amateur

-   Répétitions hebdomadaires
-   Petit groupe
-   Besoin du BPM

## Semi-professionnel

-   Plusieurs groupes
-   Concerts
-   Setlists
-   Annotations

## Professionnel

-   Plusieurs dizaines de concerts
-   Centaines de morceaux
-   Synchronisation
-   Pilotage sans les mains

# Fonctionnalités MVP

## Bibliothèque

Chaque morceau possède : - Titre - Artiste - Album - BPM - Signature
rythmique - Tonalité - Durée - Commentaires - Tags - Couleur - Favori -
Lien Spotify - Lien YouTube - Partition PDF - Photo - Difficulté - Date
d'ajout - Historique

## Écran principal

Affichage en très grand : - BPM - Nom du morceau - Signature rythmique -
Notes essentielles

## Recherche instantanée

Recherche en temps réel avec résultats immédiats.

## Tap Tempo

Calcul automatique du BPM par tapotement.

## Métronome

-   Choix du son
-   Accent du premier temps
-   Subdivisions
-   Compte à rebours

## Mode scène

-   Fond noir
-   Texte blanc
-   Très gros caractères
-   Mode paysage
-   Luminosité maximale

# Fonctionnalités Premium

## Reconnaissance automatique des morceaux

Le téléphone écoute quelques secondes via le microphone et reconnaît
automatiquement le morceau.

Affiche immédiatement : - Titre - BPM - Signature rythmique - Départ
batterie - Nombre de mesures avant l'entrée

Technologies envisagées : - Audio Fingerprinting - Machine Learning -
Cache hors ligne - API de reconnaissance musicale

## Analyse automatique

Extraction : - BPM - Signature - Tonalité - Structure (Intro, Couplet,
Refrain, Solo, Outro)

## Notes du batteur

Annotations personnalisées par morceau.

## Structure visuelle

Affichage de la structure complète du morceau.

## Setlists intelligentes

Création de concerts avec navigation rapide.

## Pilotage Bluetooth

Compatible : - Pédales Bluetooth/MIDI - Pixel Watch - Wear OS

Actions : - Morceau suivant - Morceau précédent - Lancer le métronome -
Reconnaissance

## Pixel Watch

Affichage du BPM et contrôle de l'application.

## Flash Tempo

Clignotement de l'écran ou du flash LED.

## Vibration Tempo

Retour haptique synchronisé au tempo.

## Synchronisation du groupe

Partage des informations en temps réel avec les autres musiciens.

## IA intégrée

L'IA peut : - retrouver le BPM - proposer la signature - retrouver la
structure - générer des notes - analyser un fichier audio

## Imports

-   CSV
-   Excel
-   JSON
-   Spotify
-   YouTube

## Sauvegarde

-   Locale
-   Google Drive
-   Compte Google

# Fonctionnalité révolutionnaire : Drum Assistant

Lorsque le guitariste commence un morceau, l'application reconnaît
automatiquement la chanson et affiche : - BPM - Signature - Départ
batterie - Compte à rebours jusqu'à l'entrée

# Stack technique

-   Kotlin
-   Jetpack Compose
-   Material Design 3
-   MVVM
-   Clean Architecture
-   Room
-   Hilt
-   Coroutines
-   Flow
-   DataStore
-   Media3
-   TensorFlow Lite
-   Wear OS
-   Bluetooth LE
-   Android 15+

# Roadmap

## Phase 1

-   Bibliothèque
-   BPM
-   Tap Tempo
-   Métronome
-   Setlists
-   Mode scène

## Phase 2

-   Notes
-   Structure
-   Widget
-   Pixel Watch
-   Pédale Bluetooth

## Phase 3

-   Reconnaissance via micro
-   Analyse automatique
-   Synchronisation

## Phase 4

-   IA avancée
-   Reconnaissance hors ligne
-   Analyse audio
-   Partage collaboratif
