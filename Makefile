# Makefile for iodocs
#
# Version 1.0
# Alex Kalderimis
# Fri Feb 15 13:21:32 GMT 2013

export PATH := $(PATH):$(shell find node_modules -name 'bin' -printf %p:)node_modules/.bin

deps:
	npm install ukraine@latest

deploy: deps
	chernobyl deploy labs.intermine.org .

style:
	compass compile --sass-dir public/stylesheets/scss/ --css-dir public/stylesheets/

run: style
	node app.js

test:
	@echo No Tests!

.PHONY: test
