# Makefile for iodocs
#
# Version 1.0
# Alex Kalderimis
# Fri Feb 15 13:21:32 GMT 2013

export PATH := $(PATH):$(shell find node_modules -name 'bin' -printf %p:)node_modules/.bin

test:
	@echo No Tests!

deploy:
	git push ukraine master

run:
	node app.js

.PHONY: test
